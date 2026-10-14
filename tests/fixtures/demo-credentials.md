# SchoolShield prototype — demo credentials

All of the accounts below are authenticated Supabase prototype accounts. Their password is `Test@123`; change it before any real deployment. Principal and clerk accounts can approve or reject registrations.

| School | School code | Test domain |
| --- | --- | --- |
| Setjhaba-Se-Maketse Combined School | `SMM-001` | `setjhabasemaketse.test` |
| Lenyora La Thuto Secondary School | `LLT-002` | `lenyoralathuto.test` |
| Seemahale Secondary School | `SEE-003` | `seemahale.test` |
| Leratong Secondary School | `LER-004` | `leratong.test` |
| Ntemoseng Secondary School | `NTE-005` | `ntemoseng.test` |

For each school, sign in with an email in its test domain. The account's school is assigned by its profile.

| Provisioned account | Email pattern | Approval rights |
| --- | --- | --- |
| Principal | `principal@<school-domain>` | Can approve account requests |
| School clerk | `clerk@<school-domain>` | Can approve account requests |

| Account type | Email pattern | Role assigned by the system |
| --- | --- | --- |
| Principal | `principal@<school-domain>` | Principal |
| Deputy principal | `deputy@<school-domain>` | Deputy Principal |
| School clerk | `clerk@<school-domain>` | School Clerk |
| Teacher | `teacher@<school-domain>` | Teacher |
| Security officer | `security@<school-domain>` | Security Officer |
| SGB member | `sgb@<school-domain>` | SGB Member |
| Parent / guardian | `parent@<school-domain>` | Parent / Guardian |

Examples:

- `principal@setjhabasemaketse.test` with school code `SMM-001`
- `teacher@lenyoralathuto.test` with school code `LLT-002`
- `parent@ntemoseng.test` with school code `NTE-005`

## Research reference

These names are used only as clearly marked local demo tenants. The school
profiles below were checked against the Department of Basic Education's 2026
Free State no-fee-school list; it classifies each as a public no-fee school in
Botshabelo, Mangaung Metropolitan. The contact details and staff/learner data
in the prototype remain fictional.

| Demo tenant | DBE-listed school name | EMIS | Phase | DBE-listed location |
| --- | --- | --- | --- | --- |
| `SMM-001` | Setjhaba-Se-Maketse C/S | 440602083 | Secondary / combined | No. 5 Section H, Botshabelo, 9781 |
| `LLT-002` | Lenyora La Thuto CS/S | 440602122 | Secondary | 3224 H Section, Botshabelo, 9781 |
| `SEE-003` | Seemahale S/S | 440602075 | Secondary | 514 Section K, Botshabelo, 9781 |
| `LER-004` | Leratong S/S | 440602072 | Secondary | 2307 J Section, Botshabelo, 9781 |
| `NTE-005` | Ntemoseng S/S | 440602060 | Secondary | Stand No. 02, Botshabelo, 9781 |

Source: [Department of Basic Education — Free State no-fee schools 2026](https://www.education.gov.za/LinkClick.aspx?fileticket=TlmEu1Nkvck%3D&mid=14328&portalid=0&tabid=408). DBE also documented a 2025 safe-schools campaign at [Lenyora La Thuto Secondary School in Botshabelo](https://www.education.gov.za/ArchivedDocuments/ArchivedArticles/SafeSchoolsCampaign.aspx).
