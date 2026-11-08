-- Learning: subjects, the weekly timetable (no teacher or class double-booked), assessments with
-- weights, grades, and behaviour notes. Teachers (any member) enter grades and notes; managers set
-- up subjects and the timetable and delete records. Report cards are computed from these.
-- Forward-only; adds tables and changes no existing data.
begin;

alter table public.academic_terms add constraint academic_terms_id_organization_id_key unique (id,organization_id);

create table public.subjects (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null check (length(btrim(name)) between 1 and 60),
 grade_level_id uuid,
 weekly_periods integer not null default 0 check (weekly_periods between 0 and 40),
 constraint subjects_id_organization_id_key unique (id,organization_id),
 constraint subjects_grade_fkey foreign key (grade_level_id,organization_id) references public.grade_levels(id,organization_id) on delete cascade
);
create unique index subjects_unique_name on public.subjects(organization_id, name, coalesce(grade_level_id,'00000000-0000-0000-0000-000000000000'::uuid));

create table public.timetable_slots (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 section_id uuid not null,
 weekday smallint not null check (weekday between 0 and 6),
 period smallint not null check (period between 1 and 12),
 subject_id uuid not null,
 teacher_id uuid,
 room text check (room is null or length(btrim(room)) between 1 and 40),
 constraint timetable_slot_unique unique (section_id,weekday,period),
 constraint timetable_section_fkey foreign key (section_id,organization_id) references public.sections(id,organization_id) on delete cascade,
 constraint timetable_subject_fkey foreign key (subject_id,organization_id) references public.subjects(id,organization_id) on delete cascade,
 constraint timetable_teacher_fkey foreign key (organization_id,teacher_id) references public.memberships(organization_id,user_id) on delete set null (teacher_id)
);
create unique index timetable_teacher_unique on public.timetable_slots(organization_id,teacher_id,weekday,period) where teacher_id is not null;

create table public.assessments (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 section_id uuid not null,
 subject_id uuid not null,
 term_id uuid,
 title text not null check (length(btrim(title)) between 1 and 120),
 kind text not null default 'quiz' check (kind in ('quiz','homework','project','participation','midterm','final')),
 max_score numeric(6,2) not null default 10 check (max_score > 0 and max_score <= 1000),
 weight numeric(5,2) not null default 10 check (weight > 0 and weight <= 100),
 due_date date,
 description text check (description is null or length(description) <= 1000),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 constraint assessments_id_organization_id_key unique (id,organization_id),
 constraint assessments_section_fkey foreign key (section_id,organization_id) references public.sections(id,organization_id) on delete cascade,
 constraint assessments_subject_fkey foreign key (subject_id,organization_id) references public.subjects(id,organization_id) on delete cascade,
 constraint assessments_term_fkey foreign key (term_id,organization_id) references public.academic_terms(id,organization_id) on delete set null (term_id)
);
create index assessments_section_idx on public.assessments(section_id,subject_id,due_date);

create table public.grades (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 assessment_id uuid not null,
 child_id uuid not null,
 score numeric(6,2) check (score >= 0),
 absent boolean not null default false,
 note text check (note is null or length(note) <= 200),
 graded_by uuid references auth.users(id) on delete set null,
 graded_at timestamptz not null default now(),
 constraint grades_one_per_student unique (assessment_id,child_id),
 constraint grades_assessment_fkey foreign key (assessment_id,organization_id) references public.assessments(id,organization_id) on delete cascade,
 constraint grades_child_fkey foreign key (child_id,organization_id) references public.children(id,organization_id) on delete cascade
);
create index grades_child_idx on public.grades(child_id);

create table public.behavior_notes (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 child_id uuid not null,
 kind text not null check (kind in ('positive','concern')),
 category text not null default 'other' check (category in ('participation','respect','homework','punctuality','cooperation','conduct','other')),
 note text check (note is null or length(note) <= 500),
 points smallint not null default 1 check (points between -5 and 5),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 constraint behavior_child_fkey foreign key (child_id,organization_id) references public.children(id,organization_id) on delete cascade
);
create index behavior_child_idx on public.behavior_notes(child_id,created_at desc);

-- Stamps and checks.
create function private.stamp_learning() returns trigger language plpgsql set search_path = '' as $$
begin
 if TG_TABLE_NAME = 'grades' then
  if new.score is not null and new.score > (select a.max_score from public.assessments a where a.id = new.assessment_id) then
   raise exception 'Score is above the maximum' using errcode = '23514';
  end if;
  if new.absent then new.score := null; end if;
  if TG_OP = 'UPDATE' and (new.assessment_id, new.child_id) is distinct from (old.assessment_id, old.child_id) then raise exception 'Grade cannot move' using errcode = '42501'; end if;
  new.graded_by := auth.uid(); new.graded_at := now();
 elsif TG_OP = 'INSERT' then
  new.created_by := auth.uid(); new.created_at := now();
 else
  new.created_by := old.created_by; new.created_at := old.created_at;
 end if;
 if TG_TABLE_NAME = 'behavior_notes' then
  new.points := case when new.kind = 'positive' then abs(new.points) else -abs(new.points) end;
 end if;
 return new;
end $$;
revoke all on function private.stamp_learning() from public,anon,authenticated;
create trigger stamp_learning before insert or update on public.grades for each row execute function private.stamp_learning();
create trigger stamp_learning before insert or update on public.assessments for each row execute function private.stamp_learning();
create trigger stamp_learning before insert or update on public.behavior_notes for each row execute function private.stamp_learning();
-- Lowering a maximum below an existing score is refused.
create function private.check_max_score() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.max_score < old.max_score and exists(select 1 from public.grades g where g.assessment_id = new.id and g.score > new.max_score) then
  raise exception 'Some scores are above the new maximum' using errcode = '23514';
 end if;
 return new;
end $$;
revoke all on function private.check_max_score() from public,anon,authenticated;
create trigger check_max_score before update of max_score on public.assessments for each row execute function private.check_max_score();

-- Access: everyone in the organization reads; managers set up subjects and the timetable; any
-- member records assessments, grades and behaviour; managers (or the author) delete.
do $$
declare t text;
begin
 foreach t in array array['subjects','timetable_slots','assessments','grades','behavior_notes'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('revoke all on public.%I from public,anon,authenticated', t);
  execute format('grant select,delete on public.%I to authenticated', t);
  execute format('create policy %I on public.%I for select to authenticated using(private.is_org_member(organization_id))', t || '_read', t);
  execute format('create trigger keep_record_tenant before update on public.%I for each row execute function private.keep_record_tenant()', t);
  execute format('create trigger audit_operation after insert or update or delete on public.%I for each row execute function private.audit_operation()', t);
  execute format('revoke truncate,references,trigger on public.%I from anon,authenticated', t);
 end loop;
 foreach t in array array['subjects','timetable_slots'] loop
  execute format('create policy %I on public.%I for insert to authenticated with check(private.can_manage_org(organization_id))', t || '_insert', t);
  execute format('create policy %I on public.%I for update to authenticated using(private.can_manage_org(organization_id)) with check(private.can_manage_org(organization_id))', t || '_update', t);
  execute format('create policy %I on public.%I for delete to authenticated using(private.can_manage_org(organization_id))', t || '_delete', t);
 end loop;
 foreach t in array array['assessments','grades','behavior_notes'] loop
  execute format('create policy %I on public.%I for insert to authenticated with check(private.is_org_member(organization_id))', t || '_insert', t);
  execute format('create policy %I on public.%I for update to authenticated using(private.is_org_member(organization_id)) with check(private.is_org_member(organization_id))', t || '_update', t);
 end loop;
end $$;
create policy assessments_delete on public.assessments for delete to authenticated using(private.can_manage_org(organization_id) or created_by = auth.uid());
create policy grades_delete on public.grades for delete to authenticated using(private.can_manage_org(organization_id) or graded_by = auth.uid());
create policy behavior_notes_delete on public.behavior_notes for delete to authenticated using(private.can_manage_org(organization_id) or created_by = auth.uid());
grant insert(organization_id,name,grade_level_id,weekly_periods), update(name,grade_level_id,weekly_periods) on public.subjects to authenticated;
grant insert(organization_id,section_id,weekday,period,subject_id,teacher_id,room), update(subject_id,teacher_id,room) on public.timetable_slots to authenticated;
grant insert(organization_id,section_id,subject_id,term_id,title,kind,max_score,weight,due_date,description), update(term_id,title,kind,max_score,weight,due_date,description) on public.assessments to authenticated;
grant insert(organization_id,assessment_id,child_id,score,absent,note), update(score,absent,note) on public.grades to authenticated;
grant insert(organization_id,child_id,kind,category,note,points), update(kind,category,note,points) on public.behavior_notes to authenticated;
commit;
