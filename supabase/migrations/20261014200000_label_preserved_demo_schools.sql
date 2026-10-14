-- These five retained fixture schools remain demonstration tenants by explicit
-- operator choice, even if previous QA created a non-.test account in them.
-- Match the original administrator identity, not the school display name.
update public.schools s set data_mode='demo'
where exists (
 select 1 from (values
 ('SMM-001','principal@setjhabasemaketse.test'),
 ('LLT-002','principal@lenyoralathuto.test'),
 ('SEE-003','principal@seemahale.test'),
 ('LER-004','principal@leratong.test'),
 ('NTE-005','principal@ntemoseng.test')
 ) fixture(code,email)
 join public.profiles p on p.school_id=s.id and p.role='principal'
 join auth.users u on u.id=p.id and lower(u.email)=fixture.email
 where fixture.code=s.code
);
