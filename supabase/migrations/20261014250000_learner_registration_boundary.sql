-- Capture first registration for new learners without inventing legacy dates.
create or replace function public.preserve_learner_registration_boundary()
returns trigger language plpgsql set search_path=public as $$
declare key text; grade_label text;
begin
  if TG_OP='INSERT' then
    select grade into grade_label from teacher_review_classes
      where id=new.class_id and school_id=new.school_id;
    new.record:=new.record || jsonb_build_object(
      'registeredAt',coalesce(nullif(new.record->>'registeredAt',''),now()::text),
      'registrationGrade',coalesce(new.record->>'registrationGrade',grade_label,new.record->>'grade'));
  else
    foreach key in array array['registeredAt','registrationGrade','registrationTerm','registrationYear'] loop
      if old.record ? key then
        new.record:=jsonb_set(new.record,array[key],old.record->key);
      end if;
    end loop;
  end if;
  return new;
end $$;
create trigger preserve_learner_registration_boundary
before insert or update on public.school_learners
for each row execute function public.preserve_learner_registration_boundary();
