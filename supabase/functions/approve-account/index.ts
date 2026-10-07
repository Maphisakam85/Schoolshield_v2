import { createClient } from "npm:@supabase/supabase-js@2";

import { setupUrl, normalizePhone, smsConfig, sendSms } from "./invitation.mjs";

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
      .select("school_id, role")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (!approver || !["principal", "clerk"].includes(approver.role)) return json({ error: "Only the principal or clerk can approve accounts" }, 403);

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

    const { data: school } = await admin.from("schools").select("code, name").eq("id", pending.school_id).single();
    if (!school) return json({ error: "School not found" }, 404);

    if (delivery === "preferred") delivery = pending.invitation_method || "email";
    // Never trust a caller-supplied redirect or Origin header for bearer links.
    const redirectTo = setupUrl(Deno.env.get("SCHOOLSHIELD_ACCOUNT_SETUP_URL"), delivery === "setup_link" && Deno.env.get("SCHOOLSHIELD_ALLOW_LOCAL_SETUP") === "true");
    const provider = delivery === "sms" ? smsConfig((name: string) => Deno.env.get(name)) : null;
    const phone = delivery === "sms" ? normalizePhone(pending.phone) : pending.phone;
    const inviteOptions = {
      data: { display_name: pending.display_name, school_code: school.code, school_name: school.name },
      redirectTo,
    };
    let invitedUser;
    let setupLink: string | undefined;
    if (delivery === "setup_link" || delivery === "sms") {
      const { data: generated, error: generateError } = await admin.auth.admin.generateLink({
        type: "invite",
        email: pending.email,
        options: inviteOptions,
      });
      if (generateError || !generated.user || !generated.properties?.hashed_token) return json({ error: generateError?.message || "Could not create a setup link" }, 400);
      invitedUser = generated.user;
      const direct = new URL(redirectTo);
      direct.searchParams.set("token_hash", generated.properties.hashed_token);
      direct.searchParams.set("type", "invite");
      setupLink = direct.toString();
    } else {
      const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(pending.email, inviteOptions);
      if (inviteError || !invite.user) return json({ error: inviteError?.message || "Could not send invite" }, 400);
      invitedUser = invite.user;
    }

    // Existing profiles must never be reassigned by another request or school.
    const { data: existing, error: existingError } = await admin.from("profiles").select("id").eq("id", invitedUser.id).maybeSingle();
    if (existingError || existing) return json({ error: "This email already has an assigned account. Contact the administrator." }, 409);
    const { error: profileError } = await admin.from("profiles").insert({
      id: invitedUser.id,
      school_id: pending.school_id,
      role: approvedRole,
      display_name: pending.display_name,
      phone,
    });
    if (profileError) return json({ error: "Invite sent but profile setup failed" }, 500);
    const { error: metadataError } = await admin.auth.admin.updateUserById(invitedUser.id, {
      app_metadata: { school_code: school.code, role: approvedRole },
    });
    if (metadataError) return json({ error: "Could not assign the approved account" }, 500);

    if (provider) {
      try {
        await sendSms(provider, phone, `SchoolShield: approved for ${school.name}. Email: ${pending.email}. School code: ${school.code}. Set your password: ${setupLink}`);
      } catch (error) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(invitedUser.id);
      if (cleanupError) return json({ error: "SMS failed and account cleanup failed. Contact the administrator before retrying." }, 500);
      throw error;
    }
  }
  const { error: approvalError } = await admin.from("account_requests").update({
    status: "approved",
    approved_role: approvedRole,
    reviewed_by: authData.user.id,
    reviewed_at: new Date().toISOString(),
  }).eq("id", pending.id);
  if (approvalError) return json({ error: "Invitation created but approval recording failed. Contact the administrator." }, 500);
  await admin.from("account_request_notifications").update({ read_at: new Date().toISOString() }).eq("request_id", pending.id);

  return json({ ok: true, setup_link: delivery === "setup_link" ? setupLink : undefined, message: delivery === "setup_link" ? "Account approved. Open the setup link to complete onboarding." : delivery === "sms" ? "Account approved. The SMS provider accepted the invitation for delivery." : "Account approved. An invitation email has been sent." });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Invitation could not be created" }, 400); }
});
