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
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, secretKey()!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const usersByEmail = new Map((userPage?.users || []).map((user) => [user.email?.toLowerCase(), user]));
  const { data: schoolRows } = await admin.from("schools").select("id, code");
  const schoolsByCode = new Map((schoolRows || []).map((school) => [school.code, school]));

  const created: string[] = [];
  for (const [schoolCode, domain, schoolName] of schools) {
    for (const [role, label] of demoRoles) {
      const email = `${role}@${domain}`;
      const displayName = `${schoolName} ${label}`;
      let user = usersByEmail.get(email);
      if (!user) {
        const { data, error } = await admin.auth.admin.createUser({ email, password: "Test@123", email_confirm: true, app_metadata: { school_code: schoolCode, role }, user_metadata: { display_name: displayName } });
        if (error || !data.user) return Response.json({ error: `Could not create ${email}: ${error?.message}` }, { status: 500 });
        user = data.user;
      } else {
        const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
          password: "Test@123",
          email_confirm: true,
          app_metadata: { school_code: schoolCode, role },
          user_metadata: { display_name: displayName },
        });
        if (updateError) return Response.json({ error: `Could not update ${email}: ${updateError.message}` }, { status: 500 });
      }
      const school = schoolsByCode.get(schoolCode);
      const { error: profileError } = await admin.from("profiles").upsert({ id: user.id, school_id: school?.id, role, display_name: displayName });
      if (profileError) return Response.json({ error: `Could not assign ${email}: ${profileError.message}` }, { status: 500 });
      created.push(email);
    }
  }
  return Response.json({ ok: true, created, password: "Test@123" });
});
