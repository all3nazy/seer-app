-- "My work": comments on tasks, and inquiries from staff to the school's management with replies.
-- Forward-only; apply once after review. Authors always come from the session, never the browser.
-- Inquiries are private between their author and the organization's managers.
begin;

-- 1) Task comments: every member can read and comment on the organization's tasks.
create table public.task_comments (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 task_id uuid not null,
 author_id uuid references auth.users(id) on delete set null,
 body text not null check (length(btrim(body)) between 1 and 1000),
 created_at timestamptz not null default now(),
 constraint task_comments_task_fkey foreign key (task_id,organization_id) references public.tasks(id,organization_id) on delete cascade
);
create index task_comments_task_idx on public.task_comments(task_id,created_at);

-- 2) Inquiries and their replies.
create table public.inquiries (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 author_id uuid references auth.users(id) on delete set null,
 category text not null default 'general' check (category in ('general','task','leave','supplies','student','finance','other')),
 subject text not null check (length(btrim(subject)) between 1 and 120),
 body text not null check (length(btrim(body)) between 1 and 2000),
 task_id uuid,
 status text not null default 'open' check (status in ('open','answered','closed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint inquiries_id_organization_id_key unique (id,organization_id),
 constraint inquiries_task_fkey foreign key (task_id,organization_id) references public.tasks(id,organization_id) on delete set null (task_id)
);
create index inquiries_org_status_idx on public.inquiries(organization_id,status,updated_at desc);
create index inquiries_author_idx on public.inquiries(organization_id,author_id,updated_at desc);

create table public.inquiry_replies (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 inquiry_id uuid not null,
 author_id uuid references auth.users(id) on delete set null,
 body text not null check (length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now(),
 constraint inquiry_replies_inquiry_fkey foreign key (inquiry_id,organization_id) references public.inquiries(id,organization_id) on delete cascade
);
create index inquiry_replies_inquiry_idx on public.inquiry_replies(inquiry_id,created_at);

alter table public.task_comments enable row level security;
alter table public.inquiries enable row level security;
alter table public.inquiry_replies enable row level security;
revoke all on public.task_comments,public.inquiries,public.inquiry_replies from public,anon,authenticated;

grant select,delete on public.task_comments to authenticated;
grant insert(organization_id,task_id,body) on public.task_comments to authenticated;
create policy task_comments_read on public.task_comments for select to authenticated using(private.is_org_member(organization_id));
create policy task_comments_insert on public.task_comments for insert to authenticated with check(private.is_org_member(organization_id));
-- Authors remove their own comment within a day; managers moderate any comment.
create policy task_comments_delete on public.task_comments for delete to authenticated
 using(private.can_manage_org(organization_id) or (author_id = (select auth.uid()) and created_at > now() - interval '1 day'));

grant select on public.inquiries to authenticated;
grant insert(organization_id,category,subject,body,task_id) on public.inquiries to authenticated;
grant update(status) on public.inquiries to authenticated;
create policy inquiries_read on public.inquiries for select to authenticated
 using(private.is_org_member(organization_id) and (author_id = (select auth.uid()) or private.can_manage_org(organization_id)));
create policy inquiries_insert on public.inquiries for insert to authenticated with check(private.is_org_member(organization_id));
create policy inquiries_update on public.inquiries for update to authenticated
 using(private.is_org_member(organization_id) and (author_id = (select auth.uid()) or private.can_manage_org(organization_id)))
 with check(private.is_org_member(organization_id));

grant select on public.inquiry_replies to authenticated;
grant insert(organization_id,inquiry_id,body) on public.inquiry_replies to authenticated;
-- Replies follow the inquiry: the subquery runs under the caller's RLS on inquiries.
create policy inquiry_replies_read on public.inquiry_replies for select to authenticated
 using(exists(select 1 from public.inquiries i where i.id = inquiry_id));
create policy inquiry_replies_insert on public.inquiry_replies for insert to authenticated
 with check(exists(select 1 from public.inquiries i where i.id = inquiry_id and i.organization_id = inquiry_replies.organization_id and i.status <> 'closed'));

-- Authorship and timestamps come from the session.
create function private.stamp_author() returns trigger language plpgsql set search_path = '' as $$
begin
 new.author_id := auth.uid();
 new.created_at := now();
 return new;
end $$;
revoke all on function private.stamp_author() from public,anon,authenticated;
create trigger stamp_author before insert on public.task_comments for each row execute function private.stamp_author();
create trigger stamp_author before insert on public.inquiries for each row execute function private.stamp_author();
create trigger stamp_author before insert on public.inquiry_replies for each row execute function private.stamp_author();

-- Authors may only close their inquiry; managers set any status.
create function private.guard_inquiry() returns trigger language plpgsql set search_path = '' as $$
begin
 if TG_OP = 'INSERT' then
  new.status := 'open';
  new.updated_at := now();
  return new;
 end if;
 -- Status changes made by the reply trigger (depth > 1) are allowed.
 if new.status is distinct from old.status and auth.uid() is not null and pg_trigger_depth() = 1
    and not private.can_manage_org(old.organization_id) and new.status <> 'closed' then
  raise exception 'Only managers reopen or answer inquiries' using errcode = '42501';
 end if;
 new.updated_at := now();
 return new;
end $$;
revoke all on function private.guard_inquiry() from public,anon,authenticated;
create trigger guard_inquiry before insert or update on public.inquiries for each row execute function private.guard_inquiry();

-- A manager's reply marks the inquiry answered; the author's reply reopens it.
create function private.after_inquiry_reply() returns trigger language plpgsql security definer set search_path = '' as $$
declare inquiry_author uuid;
begin
 select i.author_id into inquiry_author from public.inquiries i where i.id = new.inquiry_id;
 update public.inquiries set
  status = case when new.author_id = inquiry_author then 'open' else 'answered' end,
  updated_at = now()
 where id = new.inquiry_id and status <> 'closed';
 return null;
end $$;
revoke all on function private.after_inquiry_reply() from public,anon,authenticated;
create trigger after_inquiry_reply after insert on public.inquiry_replies for each row execute function private.after_inquiry_reply();

create trigger keep_record_tenant before update on public.inquiries for each row execute function private.keep_record_tenant();
create trigger audit_operation after insert or update or delete on public.inquiries for each row execute function private.audit_operation();
create trigger audit_operation after insert or delete on public.task_comments for each row execute function private.audit_operation();
create trigger audit_operation after insert on public.inquiry_replies for each row execute function private.audit_operation();
revoke truncate,references,trigger on public.task_comments,public.inquiries,public.inquiry_replies from anon,authenticated;
commit;
