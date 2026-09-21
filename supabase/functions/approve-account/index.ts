import { createClient } from "npm:@supabase/supabase-js@2";

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
  const delivery = String(body.delivery || "email");
  if (!requestId || !["approve", "reject"].includes(action) || !["email", "setup_link"].includes(delivery) || (action === "approve" && !["teacher", "security", "parent", "sgb", "deputy", "clerk", "principal"].includes(approvedRole))) {
    return json({ error: "A request and valid action are required" }, 400);
  }

  const { data: approver } = await admin.from("profiles")
    .select("school_id, role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (!approver || !["principal", "clerk"].includes(approver.role)) return json({ error: "Only the principal or clerk can approve accounts" }, 403);

  const { data: pending, error: pendingError } = await admin.from("account_requests")
    .select("id, school_id, email, display_name, status")
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

  const { data: school } = await admin.from("schools").select("code, name").eq("id", pending.school_id).single();
  if (!school) return json({ error: "School not found" }, 404);

  const origin = request.headers.get("origin") || "";
  let redirectTo: string | undefined;
  try {
    const requestedRedirect = new URL(String(body.redirect_to || ""));
    if (requestedRedirect.origin === origin && requestedRedirect.pathname.endsWith("/login.html")) {
      redirectTo = requestedRedirect.toString();
    }
  } catch (_) { /* Fall back to the site's login path below. */ }
  if (!redirectTo && origin) redirectTo = `${origin}/login.html`;
  const inviteOptions = {
    data: { display_name: pending.display_name, school_code: school.code, school_name: school.name },
    redirectTo,
  };
  let invitedUser;
  let setupLink: string | undefined;
  if (delivery === "setup_link") {
    const { data: generated, error: generateError } = await admin.auth.admin.generateLink({
      type: "invite",
      email: pending.email,
      options: inviteOptions,
    });
    if (generateError || !generated.user || !generated.properties?.action_link) return json({ error: generateError?.message || "Could not create a setup link" }, 400);
    invitedUser = generated.user;
    setupLink = generated.properties.action_link;
  } else {
    const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(pending.email, inviteOptions);
    if (inviteError || !invite.user) return json({ error: inviteError?.message || "Could not send invite" }, 400);
    invitedUser = invite.user;
  }

  await admin.auth.admin.updateUserById(invitedUser.id, {
    app_metadata: { school_code: school.code, role: approvedRole },
  });
  const { error: profileError } = await admin.from("profiles").upsert({
    id: invitedUser.id,
    school_id: pending.school_id,
    role: approvedRole,
    display_name: pending.display_name,
  });
  if (profileError) return json({ error: "Invite sent but profile setup failed" }, 500);

  await admin.from("account_requests").update({
    status: "approved",
    approved_role: approvedRole,
    reviewed_by: authData.user.id,
    reviewed_at: new Date().toISOString(),
  }).eq("id", pending.id);
  await admin.from("account_request_notifications").update({ read_at: new Date().toISOString() }).eq("request_id", pending.id);

  return json({ ok: true, setup_link: setupLink, message: delivery === "setup_link" ? "Account approved. Open the setup link to complete onboarding." : "Account approved. An invitation email has been sent." });
});
