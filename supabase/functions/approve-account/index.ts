import { createClient } from "npm:@supabase/supabase-js@2";

import { manageUser } from "../manage-users/service.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

function secretKey() {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) return JSON.parse(keys).default;
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

Deno.serve(async (request) => {
  try {
    if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Sign in is required" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, secretKey()!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

    const body = await request.json().catch(() => ({}));
    const requestId = String(body.request_id || "");
    const approvedRole = String(body.role || "");
    const action = String(body.action || "approve");
    let delivery = String(body.delivery || "preferred");
    if (!requestId || !["approve", "reject"].includes(action) || !["preferred", "email", "sms", "setup_link"].includes(delivery) || (action === "approve" && !["teacher", "security", "parent", "sgb", "deputy", "clerk", "principal"].includes(approvedRole))) {
      return json({ error: "A request and valid action are required" }, 400);
    }

    const { data: approver } = await admin.from("profiles")
      .select("id, school_id, role, account_status, requires_setup, onboarding_completed_at")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (!approver || approver.account_status !== "Active" || (approver.requires_setup && !approver.onboarding_completed_at) || !["principal", "clerk"].includes(approver.role)) return json({ error: "Only the principal or clerk can approve accounts" }, 403);

    const caller = createClient(Deno.env.get("SUPABASE_URL")!, secretKey()!, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false } });
    const { data: access, error: accessError } = await caller.rpc("get_my_school_access");
    if (accessError || access?.school_id !== approver.school_id) return json({ error: "School access is unavailable or suspended" }, 403);
    const { data: pending, error: pendingError } = await admin.from("account_requests")
      .select("id, school_id, email, display_name, status, invitation_method, phone")
      .eq("id", requestId)
      .eq("school_id", approver.school_id)
      .eq("status", "pending")
      .maybeSingle();
    if (pendingError || !pending) return json({ error: "Pending request not found" }, 404);

    if (action === "reject") {
      await admin.from("account_requests").update({
        status: "rejected",
        reviewed_by: authData.user.id,
        reviewed_at: new Date().toISOString(),
      }).eq("id", pending.id);
      await admin.from("account_request_notifications").update({ read_at: new Date().toISOString() }).eq("request_id", pending.id);
      return json({ ok: true, message: "Account request rejected." });
    }

    if (delivery === "preferred") delivery = pending.invitation_method || "email";
    const names = pending.display_name.trim().split(/\s+/);
    const actorClient = createClient(url, secretKey()!, { global: { headers: { Authorization: "Bearer " + token } }, auth: { autoRefreshToken: false, persistSession: false } });
    const created = await manageUser({ admin, actorClient, actor: approver,
      body: { action: "create", operation_id: pending.id, delivery, fields: {
        first_name: names.shift(), last_name: names.join(" "), email: pending.email, phone: pending.phone,
        role: approvedRole, account_status: "Active", school_id: pending.school_id
      } }, env: (name: string) => Deno.env.get(name) });
  const { error: approvalError } = await admin.from("account_requests").update({
    status: "approved",
    approved_role: approvedRole,
    reviewed_by: authData.user.id,
    reviewed_at: new Date().toISOString(),
  }).eq("id", pending.id);
  if (approvalError) return json({ error: "Invitation created but approval recording failed. Contact the administrator." }, 500);
  await admin.from("account_request_notifications").update({ read_at: new Date().toISOString() }).eq("request_id", pending.id);

  return json({ ...created, message: "Account approved. " + created.message });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Invitation could not be created" }, 400); }
});
