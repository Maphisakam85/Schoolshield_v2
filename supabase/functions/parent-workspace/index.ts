import { parentPayload } from './projection.mjs';
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
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, secretKey()!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

  const { data: profile } = await admin.from("profiles").select("school_id, role, account_status, requires_setup, onboarding_completed_at").eq("id", authData.user.id).maybeSingle();
  if (!profile || profile.account_status !== "Active" || (profile.requires_setup && !profile.onboarding_completed_at) || profile.role !== "parent") return json({ error: "This service is only available to parent accounts" }, 403);
  const caller = createClient(Deno.env.get("SUPABASE_URL")!, secretKey()!, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false } });
  const { data: access, error: accessError } = await caller.rpc("get_my_school_access");
  if (accessError || access?.school_id !== profile.school_id) return json({ error: "School access is unavailable or suspended" }, 403);
  const { data: links, error: linksError } = await admin.from("parent_learner_links").select("learner_ref").eq("school_id", profile.school_id).eq("parent_id", authData.user.id);
  if (linksError) return json({ error: "Learner links could not be verified" }, 503);
  const learnerIds = new Set((links || []).map((link) => link.learner_ref));
  if (!learnerIds.size) return json({ payload: parentPayload({}, learnerIds, authData.user.id), linked: false });

  const { data: workspace, error: workspaceError } = await admin.from("school_workspaces").select("payload, updated_at").eq("school_id", profile.school_id).maybeSingle();
  if (workspaceError || !workspace?.payload) return json({ error: "School workspace is not available" }, 404);
  const projected = parentPayload(workspace.payload as Record<string, any>, learnerIds, authData.user.id);
  if (!access.features.announcements) {
    projected.announcements = [];
    projected.notifications = projected.notifications.filter((n: any) => !n.announcementId && !/announcement/i.test(n.type || ""));
  }
  return json({ payload: projected, linked: true, updated_at: workspace.updated_at });
});
