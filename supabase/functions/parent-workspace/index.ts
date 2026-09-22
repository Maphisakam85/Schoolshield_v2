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

function parentPayload(raw: Record<string, any>, learnerIds: Set<string>) {
  const learners = (raw.learners || []).filter((learner: any) => learnerIds.has(learner.id));
  const classIds = new Set(learners.map((learner: any) => learner.class));
  const learnerNames = new Set(learners.map((learner: any) => learner.name));
  const onlyLearnerScores = (scores: Record<string, unknown> = {}) => Object.fromEntries(
    Object.entries(scores).filter(([id]) => learnerIds.has(id)),
  );
  const reports = (raw.reports || []).filter((report: any) => classIds.has(report.class)).map((report: any) => ({
    ...report,
    releasedLearners: Object.fromEntries(Object.entries(report.releasedLearners || {}).filter(([id]) => learnerIds.has(id))),
  }));

  return {
    __v: raw.__v || 13,
    classes: (raw.classes || []).filter((schoolClass: any) => classIds.has(schoolClass.id)),
    learners,
    assessments: (raw.assessments || []).filter((assessment: any) => classIds.has(assessment.class)).map((assessment: any) => ({ ...assessment, scores: onlyLearnerScores(assessment.scores) })),
    reports,
    announcements: (raw.announcements || []).filter((announcement: any) => /parent|family|whole.school/i.test(String(announcement.audience || ""))),
    visitors: [], incidents: [], staff: [], staffChangeRequests: [], security: [], appointments: [], teacherChat: [],
    notifications: (raw.notifications || []).filter((notice: any) => notice.scope === "whole-school" || notice.scope === "parents" || learnerIds.has(notice.learnerId)),
    sickNotices: (raw.sickNotices || []).filter((notice: any) => learnerNames.has(notice.person)),
    parentChat: (raw.parentChat || []).filter((conversation: any) => learnerIds.has(conversation.learnerId)),
    attendanceRegisters: (raw.attendanceRegisters || []).filter((register: any) => classIds.has(register.class)).map((register: any) => ({ ...register, entries: onlyLearnerScores(register.entries) })),
    attendanceWeeks: (raw.attendanceWeeks || []).filter((week: any) => classIds.has(week.class)),
    chatExtras: [], reportRequests: [], teacherAssignments: [],
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in is required" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, secretKey()!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

  const { data: profile } = await admin.from("profiles").select("school_id, role").eq("id", authData.user.id).maybeSingle();
  if (!profile || profile.role !== "parent") return json({ error: "This service is only available to parent accounts" }, 403);
  const { data: links } = await admin.from("parent_learner_links").select("learner_ref").eq("school_id", profile.school_id).eq("parent_id", authData.user.id);
  const learnerIds = new Set((links || []).map((link) => link.learner_ref));
  if (!learnerIds.size) return json({ payload: parentPayload({}, learnerIds), linked: false });

  const { data: workspace, error: workspaceError } = await admin.from("school_workspaces").select("payload, updated_at").eq("school_id", profile.school_id).maybeSingle();
  if (workspaceError || !workspace?.payload) return json({ error: "School workspace is not available" }, 404);
  return json({ payload: parentPayload(workspace.payload as Record<string, any>, learnerIds), linked: true, updated_at: workspace.updated_at });
});
