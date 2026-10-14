import { createClient } from "npm:@supabase/supabase-js@2";

const schools = [
  ["SMM-001", "setjhabasemaketse.test", "Setjhaba-Se-Maketse"],
  ["LLT-002", "lenyoralathuto.test", "Lenyora La Thuto"],
  ["SEE-003", "seemahale.test", "Seemahale"],
  ["LER-004", "leratong.test", "Leratong"],
  ["NTE-005", "ntemoseng.test", "Ntemoseng"],
];
const demoRoles = [
  ["principal", "Principal"], ["deputy", "Deputy Principal"], ["clerk", "School Clerk"],
  ["teacher", "Teacher"], ["security", "Security Officer"], ["parent", "Parent / Guardian"], ["sgb", "SGB Member"],
];

function secretKey() {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) return JSON.parse(keys).default;
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  if (Deno.env.get('ALLOW_DEMO_BOOTSTRAP') !== 'true') return Response.json({ error: 'Demo bootstrap is disabled' }, { status: 403 });
  const password = Deno.env.get('DEMO_BOOTSTRAP_PASSWORD');
  if (!password || password.length < 12) return Response.json({ error: 'Configure a bootstrap password of at least 12 characters' }, { status: 503 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, secretKey()!, { auth: { autoRefreshToken: false, persistSession: false } });
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Sign in is required" }, { status: 401 });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return Response.json({ error: "Invalid session" }, { status: 401 });
  const { data: caller } = await admin.from("profiles").select("role, school_id, account_status, requires_setup, onboarding_completed_at").eq("id", authData.user.id).maybeSingle();
  if (!caller || caller.role !== "principal" || caller.account_status !== "Active" || (caller.requires_setup && !caller.onboarding_completed_at)) return Response.json({ error: "Only a principal can provision demonstration accounts" }, { status: 403 });
  const { data: schoolRows } = await admin.from("schools").select("id, code, data_mode").eq("id", caller.school_id);
  if (!schoolRows?.some(s => s.data_mode === "demo")) return Response.json({ error: "Demo bootstrap cannot run in a live or QA school" }, { status: 403 });
  const { data: userPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const usersByEmail = new Map((userPage?.users || []).map((user) => [user.email?.toLowerCase(), user]));
  const schoolsByCode = new Map((schoolRows || []).map((school) => [school.code, school]));

  const created: string[] = [];
  for (const [schoolCode, domain, schoolName] of schools) {
    const school = schoolsByCode.get(schoolCode);
    if (!school) continue;
    for (const [role, label] of demoRoles) {
      const email = `${role}@${domain}`;
      const displayName = `${schoolName} ${label}`;
      let user = usersByEmail.get(email);
      if (!user) {
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { school_code: schoolCode, role }, user_metadata: { display_name: displayName } });
        if (error || !data.user) return Response.json({ error: `Could not create ${email}: ${error?.message}` }, { status: 500 });
        user = data.user;
      } else {
        // Existing pilot accounts, passwords, profile assignments and family
        // links are never reset or guessed by this optional bootstrap.
        continue;
      }
      const { error: profileError } = await admin.from("profiles").upsert({ id: user.id, school_id: school.id, role, display_name: displayName }, { onConflict: "id", ignoreDuplicates: true });
      if (profileError) return Response.json({ error: `Could not assign ${email}: ${profileError.message}` }, { status: 500 });
      created.push(email);
    }
  }
  return Response.json({ ok: true, created });
});
