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
  const { data: profile } = await admin.from("profiles").select("school_id, role, display_name").eq("id", auth.user.id).maybeSingle();
  if (!profile || !["parent", "teacher"].includes(profile.role)) return json({ error: "Only parent or teacher accounts can use this endpoint" }, 403);
  const body = await request.json().catch(() => ({}));
  const learnerId = String(body.learner_id || "");
  const text = String(body.text || "").trim();
  if (!learnerId || !text || text.length > 2000) return json({ error: "A learner and message up to 2,000 characters are required" }, 400);
  const { data: workspace } = await admin.from("school_workspaces").select("payload").eq("school_id", profile.school_id).maybeSingle();
  const payload = workspace?.payload as Record<string, any> | undefined;
  if (!payload) return json({ error: "School workspace not found" }, 404);
  const learner = (payload.learners || []).find((item: any) => item.id === learnerId);
  if (!learner) return json({ error: "Learner record not found" }, 404);
  if (profile.role === "parent") {
    const { data: link } = await admin.from("parent_learner_links").select("learner_ref").eq("school_id", profile.school_id).eq("parent_id", auth.user.id).eq("learner_ref", learnerId).maybeSingle();
    if (!link) return json({ error: "This learner is not linked to your account" }, 403);
  } else {
    const schoolClass = (payload.classes || []).find((item: any) => item.id === learner.class);
    if (!schoolClass || schoolClass.teacher !== profile.display_name) return json({ error: "You are not assigned to this learner's class" }, 403);
  }
  payload.parentChat = payload.parentChat || [];
  let conversation = payload.parentChat.find((item: any) => item.learnerId === learnerId);
  if (!conversation) {
    const schoolClass = (payload.classes || []).find((item: any) => item.id === learner.class);
    conversation = { id: profile.display_name, learnerId, class: learner.class, role: `Parent · ${learner.name} (${learner.class})`, initials: profile.display_name.slice(0, 2).toUpperCase(), legacyOwner: "parent", messages: [] };
    payload.parentChat.push(conversation);
  }
  conversation.messages = conversation.messages || [];
  conversation.messages.push({ from: "me", sender: profile.display_name, text, date: new Date().toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }), sentAt: new Date().toISOString() });
  const { error: updateError } = await admin.from("school_workspaces").update({ payload, updated_by: auth.user.id }).eq("school_id", profile.school_id);
  if (updateError) return json({ error: "Could not save message" }, 500);
  return json({ ok: true });
});
