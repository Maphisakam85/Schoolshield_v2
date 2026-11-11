import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function secretKey() {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  return keys ? JSON.parse(keys).default : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in is required" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, secretKey()!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth.user) return json({ error: "Invalid session" }, 401);
  const { data: profile } = await admin.from("profiles").select("school_id, role, display_name, account_status, requires_setup, onboarding_completed_at").eq("id", auth.user.id).maybeSingle();
  if (!profile || profile.account_status !== "Active" || (profile.requires_setup && !profile.onboarding_completed_at) || !["parent", "teacher"].includes(profile.role)) return json({ error: "Only parent or teacher accounts can use this endpoint" }, 403);
  const caller = createClient(Deno.env.get("SUPABASE_URL")!, secretKey()!, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false } });
  const { data: access, error: accessError } = await caller.rpc("get_my_school_access");
  if (accessError || access?.school_id !== profile.school_id) return json({ error: "School access is unavailable or suspended" }, 403);
  const body = await request.json().catch(() => ({}));
  const learnerId = String(body.learner_id || "");
  const text = String(body.text || "").trim();
  const requestId = String(body.request_id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId) || !learnerId || !text || text.length > 2000) return json({ error: "A request ID, learner and message up to 2,000 characters are required" }, 400);
  const { data, error } = await caller.rpc("send_parent_chat_message", { p_id: requestId, p_learner: learnerId, p_text: text });
  if (error || !data?.ok) return json({ error: "The message could not be confirmed. Check learner access and retry the saved message." }, 409);
  return json(data);

});
