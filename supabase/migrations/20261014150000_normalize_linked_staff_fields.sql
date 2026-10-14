-- Auth/profile UUIDs, rather than historical role labels, supply linked staff
-- identity fields. Preserve all other HR details and refresh each school once.
alter table school_staff disable trigger project_staff_change;
update school_staff s set record=s.record||jsonb_build_object('role',case p.role when 'teacher' then 'Teacher' when 'principal' then 'Principal' when 'deputy' then 'Deputy Principal' when 'clerk' then 'Clerk' when 'security' then 'Security Officer' else p.role::text end,'phone',p.phone,'email',p.email,'employeeId',p.employee_id,'status',p.account_status)
from profiles p where p.school_id=s.school_id and p.id=s.profile_id;
alter table school_staff enable trigger project_staff_change;
update school_workspaces set payload=school_core_payload(school_id,payload),version=version+1;
