import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

const db = new PGlite();
const owner = "10000000-0000-0000-0000-000000000001";
const staff = "10000000-0000-0000-0000-000000000002";
const outsider = "10000000-0000-0000-0000-000000000003";
const unverified = "10000000-0000-0000-0000-000000000004";
const orgA = "20000000-0000-0000-0000-000000000001";
const orgB = "20000000-0000-0000-0000-000000000002";
const childA = "30000000-0000-0000-0000-000000000001";
const childB = "30000000-0000-0000-0000-000000000002";
const guardianB = "40000000-0000-0000-0000-000000000002";
const branchB = "50000000-0000-0000-0000-000000000002";
const reconcile = readFileSync("supabase/migrations/20261106122846_reconcile_tenant_boundaries.sql", "utf8");
const operations = readFileSync("supabase/migrations/20261106123009_school_operations.sql", "utf8");
async function as(role: "authenticated" | "anon" | "service_role", user = "") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec(`set role ${role}`);
}
async function rows(sql: string) { return (await db.query<Record<string,unknown>>(sql)).rows; }
/** The private token behind a link in a message, whether the link is long (/c/<uuid>) or short (/s/CODE). */
async function linkToken(body: string, kind: "c" | "p"): Promise<string> {
  const long = body.match(new RegExp(`/${kind}/([0-9a-f-]{36})`));
  if (long) return long[1];
  const code = body.match(/\/s\/([A-Za-z0-9]{10})/)![1];
  const path = (await db.query<{ p: string }>("select public.resolve_short($1) as p", [code])).rows[0].p;
  return path.split("/")[2];
}

beforeAll(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email_confirmed_at timestamptz, email text, instance_id uuid, aud text, role text, encrypted_password text,
      raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz, confirmation_token text, recovery_token text, email_change_token_new text, email_change text);
    create table auth.identities(provider_id text, user_id uuid, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
    -- Stand-ins for pgcrypto's bcrypt helpers, which embedded Postgres lacks.
    -- Supabase Storage, reduced to what the receipts policies need.
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean default false);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated;
    grant select, insert on storage.objects to anon,authenticated;
    create schema extensions;
    create function extensions.gen_salt(kind text) returns text language sql as $$ select '$2a$06$' || md5(random()::text) $$;
    create function extensions.crypt(password text, salt text) returns text language sql as $$ select 'hash:' || md5(password) $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
  `);
  // pgcrypto is unavailable in embedded Postgres; gen_random_uuid is built in.
  await db.exec(readFileSync("supabase/migrations/0001_core.sql", "utf8").replace("create extension if not exists pgcrypto;", ""));
  // Model existing Supabase defaults: migration must tighten pre-existing grants too.
  await db.exec("grant all on all tables in schema public to anon,authenticated; grant usage on all sequences in schema public to anon,authenticated");
  await db.exec(reconcile);
  // The production database already has composite FKs/private helpers. Reconciliation must be safe there.
  await db.exec(reconcile);
  await db.exec(operations);
  const onboarding = readdirSync("supabase/migrations").filter(name => name.endsWith("_approved_org_onboarding.sql"));
  if (onboarding.length !== 1) throw new Error("Expected exactly one approved onboarding migration");
  await db.exec(readFileSync(`supabase/migrations/${onboarding[0]}`, "utf8"));
  const isolation = readdirSync("supabase/migrations").filter(name => name.endsWith("_isolate_onboarding_privileges.sql"));
  if (isolation.length !== 1) throw new Error("Expected exactly one onboarding isolation migration");
  await db.exec(readFileSync(`supabase/migrations/${isolation[0]}`, "utf8"));
  const tasks = readdirSync("supabase/migrations").filter(name => name.endsWith("_task_workflow.sql"));
  if (tasks.length !== 1) throw new Error("Expected exactly one task workflow migration");
  await db.exec(readFileSync(`supabase/migrations/${tasks[0]}`, "utf8"));
  const team = readdirSync("supabase/migrations").filter(name => name.endsWith("_team_records_links.sql"));
  if (team.length !== 1) throw new Error("Expected exactly one team, records and links migration");
  await db.exec(readFileSync(`supabase/migrations/${team[0]}`, "utf8"));
  const studentFiles = readdirSync("supabase/migrations").filter(name => name.endsWith("_student_files_attendance.sql"));
  if (studentFiles.length !== 1) throw new Error("Expected exactly one student files and attendance migration");
  await db.exec(readFileSync(`supabase/migrations/${studentFiles[0]}`, "utf8"));
  const academic = readdirSync("supabase/migrations").filter(name => name.endsWith("_academic_structure.sql"));
  if (academic.length !== 1) throw new Error("Expected exactly one academic structure migration");
  await db.exec(readFileSync(`supabase/migrations/${academic[0]}`, "utf8"));
  const admissions = readdirSync("supabase/migrations").filter(name => name.endsWith("_admissions.sql"));
  if (admissions.length !== 1) throw new Error("Expected exactly one admissions migration");
  await db.exec(readFileSync(`supabase/migrations/${admissions[0]}`, "utf8"));
  const summaries = readdirSync("supabase/migrations").filter(name => name.endsWith("_class_summaries.sql"));
  if (summaries.length !== 1) throw new Error("Expected exactly one class summaries migration");
  await db.exec(readFileSync(`supabase/migrations/${summaries[0]}`, "utf8"));
  const myWork = readdirSync("supabase/migrations").filter(name => name.endsWith("_my_work.sql"));
  if (myWork.length !== 1) throw new Error("Expected exactly one my work migration");
  await db.exec(readFileSync(`supabase/migrations/${myWork[0]}`, "utf8"));
  const contacts = readdirSync("supabase/migrations").filter(name => name.endsWith("_member_contacts.sql"));
  if (contacts.length !== 1) throw new Error("Expected exactly one member contacts migration");
  await db.exec(readFileSync(`supabase/migrations/${contacts[0]}`, "utf8"));
  const pickups = readdirSync("supabase/migrations").filter(name => name.endsWith("_pickups.sql"));
  if (pickups.length !== 1) throw new Error("Expected exactly one pickups migration");
  await db.exec(readFileSync(`supabase/migrations/${pickups[0]}`, "utf8"));
  const finance = readdirSync("supabase/migrations").filter(name => name.endsWith("_finance.sql"));
  if (finance.length !== 1) throw new Error("Expected exactly one finance migration");
  await db.exec(readFileSync(`supabase/migrations/${finance[0]}`, "utf8"));
  const live = readdirSync("supabase/migrations").filter(name => name.endsWith("_live_classes.sql"));
  if (live.length !== 1) throw new Error("Expected exactly one live classes migration");
  await db.exec(readFileSync(`supabase/migrations/${live[0]}`, "utf8"));
  const branded = readdirSync("supabase/migrations").filter(name => name.endsWith("_branded_documents.sql"));
  if (branded.length !== 1) throw new Error("Expected exactly one branded documents migration");
  await db.exec(readFileSync(`supabase/migrations/${branded[0]}`, "utf8"));
  const family = readdirSync("supabase/migrations").filter(name => name.endsWith("_family_portal.sql"));
  if (family.length !== 1) throw new Error("Expected exactly one family portal migration");
  await db.exec(readFileSync(`supabase/migrations/${family[0]}`, "utf8"));
  const hr = readdirSync("supabase/migrations").filter(name => name.endsWith("_staff_hr.sql"));
  if (hr.length !== 1) throw new Error("Expected exactly one staff HR migration");
  await db.exec(readFileSync(`supabase/migrations/${hr[0]}`, "utf8"));
  const learning = readdirSync("supabase/migrations").filter(name => name.endsWith("_learning.sql"));
  if (learning.length !== 1) throw new Error("Expected exactly one learning migration");
  await db.exec(readFileSync(`supabase/migrations/${learning[0]}`, "utf8"));
  const transport = readdirSync("supabase/migrations").filter(name => name.endsWith("_transport.sql"));
  if (transport.length !== 1) throw new Error("Expected exactly one transport migration");
  await db.exec(readFileSync(`supabase/migrations/${transport[0]}`, "utf8"));
  const online = readdirSync("supabase/migrations").filter(name => name.endsWith("_online_payments.sql"));
  if (online.length !== 1) throw new Error("Expected exactly one online payments migration");
  await db.exec(readFileSync(`supabase/migrations/${online[0]}`, "utf8"));
  const messaging = readdirSync("supabase/migrations").filter(name => name.endsWith("_messaging.sql"));
  if (messaging.length !== 1) throw new Error("Expected exactly one messaging migration");
  await db.exec(readFileSync(`supabase/migrations/${messaging[0]}`, "utf8"));
  const hardening = readdirSync("supabase/migrations").filter(name => name.endsWith("_hardening.sql"));
  if (hardening.length !== 1) throw new Error("Expected exactly one hardening migration");
  await db.exec(readFileSync(`supabase/migrations/${hardening[0]}`, "utf8"));
  const lifecycle = readdirSync("supabase/migrations").filter(name => name.endsWith("_lifecycle_portal.sql"));
  if (lifecycle.length !== 1) throw new Error("Expected exactly one lifecycle migration");
  await db.exec(readFileSync(`supabase/migrations/${lifecycle[0]}`, "utf8"));
  const staffAccess = readdirSync("supabase/migrations").filter(name => name.endsWith("_staff_access_links.sql"));
  if (staffAccess.length !== 1) throw new Error("Expected exactly one staff access migration");
  await db.exec(readFileSync(`supabase/migrations/${staffAccess[0]}`, "utf8"));
  const teaching = readdirSync("supabase/migrations").filter(name => name.endsWith("_teaching_notifications.sql"));
  if (teaching.length !== 1) throw new Error("Expected exactly one teaching notifications migration");
  await db.exec(readFileSync(`supabase/migrations/${teaching[0]}`, "utf8"));
  const pushJobs = readdirSync("supabase/migrations").filter(name => name.endsWith("_push_health.sql"));
  if (pushJobs.length !== 1) throw new Error("Expected exactly one push and health migration");
  await db.exec(readFileSync(`supabase/migrations/${pushJobs[0]}`, "utf8"));
  const subscriptions = readdirSync("supabase/migrations").filter(name => name.endsWith("_subscriptions.sql"));
  if (subscriptions.length !== 1) throw new Error("Expected exactly one subscriptions migration");
  await db.exec(readFileSync(`supabase/migrations/${subscriptions[0]}`, "utf8"));
  const pilot = readdirSync("supabase/migrations").filter(name => name.endsWith("_pilot_launch.sql"));
  if (pilot.length !== 1) throw new Error("Expected exactly one pilot launch migration");
  await db.exec(readFileSync(`supabase/migrations/${pilot[0]}`, "utf8"));
  const support = readdirSync("supabase/migrations").filter(name => name.endsWith("_support.sql"));
  if (support.length !== 1) throw new Error("Expected exactly one support migration");
  await db.exec(readFileSync(`supabase/migrations/${support[0]}`, "utf8"));
  const invites = readdirSync("supabase/migrations").filter(name => name.endsWith("_org_invites.sql"));
  if (invites.length !== 1) throw new Error("Expected exactly one org invites migration");
  await db.exec(readFileSync(`supabase/migrations/${invites[0]}`, "utf8"));
  const supportRead = readdirSync("supabase/migrations").filter(name => name.endsWith("_support_read.sql"));
  if (supportRead.length !== 1) throw new Error("Expected exactly one support read migration");
  await db.exec(readFileSync(`supabase/migrations/${supportRead[0]}`, "utf8"));
  const telegram = readdirSync("supabase/migrations").filter(name => name.endsWith("_telegram.sql"));
  if (telegram.length !== 1) throw new Error("Expected exactly one telegram migration");
  await db.exec(readFileSync(`supabase/migrations/${telegram[0]}`, "utf8"));
  const templates = readdirSync("supabase/migrations").filter(name => name.endsWith("_reply_templates.sql"));
  if (templates.length !== 1) throw new Error("Expected exactly one reply templates migration");
  await db.exec(readFileSync(`supabase/migrations/${templates[0]}`, "utf8"));
  const guided = readdirSync("supabase/migrations").filter(name => name.endsWith("_onboarding.sql") && !name.endsWith("_org_onboarding.sql"));
  if (guided.length !== 1) throw new Error("Expected exactly one guided onboarding migration");
  await db.exec(readFileSync(`supabase/migrations/${guided[0]}`, "utf8"));
  await db.exec(`
    insert into auth.users(id,email_confirmed_at) values ('${owner}',now()),('${staff}',now()),('${outsider}',now()),('${unverified}',null);
    insert into public.organizations(id,name,type) values ('${orgA}','School A','school'),('${orgB}','School B','school');
    insert into public.memberships values ('${orgA}','${owner}','owner'),('${orgA}','${staff}','staff'),('${orgB}','${outsider}','admin');
    insert into public.children(id,organization_id,full_name) values ('${childA}','${orgA}','Private Child A'),('${childB}','${orgB}','Private Child B');
    insert into public.guardians(id,organization_id,full_name,phone) values ('${guardianB}','${orgB}','Private Guardian','123456789');
    insert into public.branches(id,organization_id,name) values ('${branchB}','${orgB}','Branch B');
    insert into public.invoices(organization_id,amount_sar,status) values ('${orgA}',100,'issued'),('${orgB}',200,'issued');
  `);
}, 30000);
beforeEach(async () => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub','',false)"); });
afterAll(async () => { await db.close(); });

describe("Postgres tenant isolation and operational authorization", () => {
  it("reconciles baseline and an already reconciled schema without dropping tenant foreign keys", async () => {
    const result = await rows("select conname from pg_constraint where conname like '%_organization_id_fkey' and conrelid in ('public.enrollments'::regclass,'public.child_guardians'::regclass,'public.invoices'::regclass)");
    expect(result.length).toBe(8);
  });
  it("anonymous callers cannot read children even with a project default SELECT grant", async () => {
    await as("anon"); expect(await rows("select id from public.children")).toEqual([]);
  });
  it("authenticated callers without a user cannot read children", async () => {
    await as("authenticated"); expect(await rows("select id from public.children")).toEqual([]);
  });
  it("members can only read children belonging to their tenant", async () => {
    await as("authenticated", owner);
    expect(await rows("select id from public.children")).toEqual([{id:childA}]);
    expect(await rows(`select id from public.children where organization_id='${orgB}'`)).toEqual([]);
  });
  it("an administrator cannot insert into another tenant", async () => {
    await as("authenticated",owner);
    await expect(db.exec(`insert into public.children(organization_id,full_name) values ('${orgB}','Attack')`)).rejects.toMatchObject({code:"42501"});
  });
  it("staff may read their children but cannot create or update operational records", async () => {
    await as("authenticated",staff);
    expect(await rows("select id from public.children")).toEqual([{id:childA}]);
    await expect(db.exec(`insert into public.branches(organization_id,name) values ('${orgA}','Unauthorized')`)).rejects.toMatchObject({code:"42501"});
    expect(await rows(`update public.children set full_name='Attack' where id='${childA}' returning id`)).toEqual([]);
  });
  it("staff cannot read invoice records or the audit log", async () => {
    await as("authenticated",staff);
    expect(await rows("select id from public.invoices")).toEqual([]);
    expect(await rows("select id from public.audit_events")).toEqual([]);
  });
  it("owner writes are recorded without child names or other values", async () => {
    await as("authenticated",owner);
    const inserted = await rows(`insert into public.branches(organization_id,name) values ('${orgA}','Private branch name') returning id`);
    const event = await rows(`select organization_id,actor_id,entity,record_id,action from public.audit_events where record_id='${inserted[0].id}'`);
    expect(event).toEqual([{organization_id:orgA,actor_id:owner,entity:"branches",record_id:inserted[0].id,action:"INSERT"}]);
    const columns = await rows("select column_name from information_schema.columns where table_schema='public' and table_name='audit_events'");
    expect(columns.map(r=>r.column_name)).not.toContain("payload");
  });
  it("cross-tenant child, branch, guardian and relationship references are rejected", async () => {
    await as("authenticated",owner);
    for (const sql of [
      `insert into public.enrollments(organization_id,child_id) values ('${orgA}','${childB}')`,
      `insert into public.enrollments(organization_id,child_id,branch_id) values ('${orgA}','${childA}','${branchB}')`,
      `insert into public.invoices(organization_id,guardian_id,amount_sar) values ('${orgA}','${guardianB}',10)`
    ]) await expect(db.exec(sql)).rejects.toMatchObject({code:"23503"});
    // No child_guardians write policy exists; test the composite constraint with the DB operator.
    await db.exec("reset role");
    await expect(db.exec(`insert into public.child_guardians values ('${orgA}','${childA}','${guardianB}','father')`)).rejects.toMatchObject({code:"23503"});
  });
  it("an administrator of both tenants still cannot move a record between them", async () => {
    await db.exec(`insert into public.memberships values ('${orgB}','${owner}','admin')`);
    await as("authenticated",owner);
    await expect(db.exec(`update public.children set organization_id='${orgB}' where id='${childA}'`)).rejects.toMatchObject({code:"23514"});
    // Operator cleanup runs without a user session.
    await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub','',false)"); await db.exec(`delete from public.memberships where organization_id='${orgB}' and user_id='${owner}'`);
  });
  it("organization updates only allow name/type and have an audit event", async () => {
    await as("authenticated",owner);
    await db.exec(`update public.organizations set name='Updated school' where id='${orgA}'`);
    expect((await rows(`select action from public.audit_events where entity='organizations' and record_id='${orgA}'`))).toContainEqual({action:"UPDATE"});
    await expect(db.exec(`update public.organizations set created_at=now() where id='${orgA}'`)).rejects.toMatchObject({code:"42501"});
    await expect(db.exec(`update public.organizations set id='20000000-0000-0000-0000-000000000099' where id='${orgA}'`)).rejects.toMatchObject({code:"42501"});
  });
  it("members cannot create organizations, promote themselves, or forge audit events", async () => {
    await as("authenticated",staff);
    await expect(db.exec("insert into public.organizations(name,type) values ('Attack','school')")).rejects.toMatchObject({code:"42501"});
    await expect(db.exec(`update public.memberships set role='owner' where user_id='${staff}'`)).rejects.toMatchObject({code:"42501"});
    await expect(db.exec(`insert into public.audit_events(organization_id,entity,record_id,action) values ('${orgA}','children','${childA}','INSERT')`)).rejects.toMatchObject({code:"42501"});
    await expect(db.exec("delete from public.audit_events")).rejects.toMatchObject({code:"42501"});
    await expect(db.exec("truncate public.audit_events")).rejects.toMatchObject({code:"42501"});
    await expect(db.exec("truncate public.children cascade")).rejects.toMatchObject({code:"42501"});
  });
  it("bootstrap RPC is unavailable to anonymous or authenticated callers", async () => {
    for(const role of ["anon","authenticated"] as const) {
      await as(role,owner);
      await expect(db.exec(`select public.bootstrap_organization('${owner}','Attack','school')`)).rejects.toMatchObject({code:"42501"});
    }
  });
  it("operator bootstrap requires a verified user and records owner plus audit atomically", async () => {
    await as("service_role");
    await expect(db.exec(`select public.bootstrap_organization('${unverified}','No','school')`)).rejects.toThrow("verified administrator");
    const result=await rows(`select public.bootstrap_organization('${owner}','Verified school','school') as id`);
    await db.exec("reset role");
    expect(await rows(`select role from public.memberships where organization_id='${result[0].id}' and user_id='${owner}'`)).toEqual([{role:"owner"}]);
    expect(await rows(`select action from public.audit_events where organization_id='${result[0].id}' and entity='organizations'`)).toEqual([{action:"INSERT"}]);
  });
});


describe("approved organization invitations", () => {
  const approved="60000000-0000-0000-0000-000000000001";
  const expired="60000000-0000-0000-0000-000000000002";
  const duplicate="60000000-0000-0000-0000-000000000003";
  const invalid="60000000-0000-0000-0000-000000000004";
  beforeAll(async () => {
    await db.exec("reset role");
    await db.exec(`insert into auth.users(id,email_confirmed_at,email) values
     ('${approved}',now(),'Approved@Example.com'),
     ('${expired}',now(),'expired@example.com'),
     ('${duplicate}',now(),'approved@example.com'),
     ('${invalid}',null,'unverified@example.com');
     insert into private.organization_invitations(email,org_name,org_type,expires_at) values
     ('approved@example.com','Approved nursery','nursery',now()+interval '1 day'),
     ('expired@example.com','Expired school','school',now()-interval '1 day'),
     ('unverified@example.com','Unverified school','school',now()+interval '1 day');`);
  });
  it("denies anonymous invocation and authenticated callers without a verified user",async()=>{
    await as("anon");
    await expect(db.exec("select public.claim_organization_invitation()")).rejects.toMatchObject({code:"42501"});
    await as("authenticated");
    await expect(db.exec("select public.claim_organization_invitation()")).rejects.toMatchObject({code:"42501"});
    await as("authenticated",invalid);
    await expect(db.exec("select public.claim_organization_invitation()")).rejects.toMatchObject({code:"42501"});
  });
  it("does not trust an approval or email supplied through JWT metadata",async()=>{
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({email:"approved@example.com",user_metadata:{email:"approved@example.com"}})]);
    await as("authenticated",staff);
    await expect(db.exec("select public.claim_organization_invitation()")).rejects.toMatchObject({code:"42501"});
  });
  it("denies expired approval without creating an organization",async()=>{
    const before=await rows("select count(*)::int as count from public.organizations");
    await as("authenticated",expired);
    await expect(db.exec("select public.claim_organization_invitation()")).rejects.toMatchObject({code:"42501"});
    await db.exec("reset role");
    expect(await rows("select count(*)::int as count from public.organizations")).toEqual(before);
  });
  it("keeps approval records invisible and unwritable to all API roles",async()=>{
    for(const role of ["anon","authenticated","service_role"] as const){
      await as(role,approved);
      await expect(db.exec("select * from private.organization_invitations")).rejects.toMatchObject({code:"42501"});
      await expect(db.exec("insert into private.organization_invitations(email,org_name,org_type,expires_at) values ('attack@example.com','Attack','school',now())")).rejects.toMatchObject({code:"42501"});
    }
  });
  it("claims one approved email atomically and returns the same owned organization on retry",async()=>{
    await as("authenticated",approved);
    const result=await rows("select public.claim_organization_invitation() as id");
    expect(await rows("select public.claim_organization_invitation() as id")).toEqual(result);
    expect(await rows(`select role from public.memberships where organization_id='${result[0].id}' and user_id='${approved}'`)).toEqual([{role:"owner"}]);
    expect(await rows(`select name,type from public.organizations where id='${result[0].id}'`)).toEqual([{name:"Approved nursery",type:"nursery"}]);
    expect(await rows(`select entity,action from public.audit_events where organization_id='${result[0].id}'`)).toEqual([{entity:"organizations",action:"INSERT"}]);
    await db.exec("reset role");
    const claim=await rows("select claimed_by,organization_id,claimed_at is not null as claimed from private.organization_invitations where email='approved@example.com'");
    expect(claim).toEqual([{claimed_by:approved,organization_id:result[0].id,claimed:true}]);
  });
  it("does not allow a different verified user with the same email to reuse a consumed approval",async()=>{
    await as("authenticated",duplicate);
    await expect(db.exec("select public.claim_organization_invitation()")).rejects.toMatchObject({code:"42501"});
  });
  it("does not silently restore revoked ownership on an idempotent retry",async()=>{
    await db.exec(`update public.memberships set role='staff' where user_id='${approved}'`);
    await as("authenticated",approved);
    await expect(db.exec("select public.claim_organization_invitation()")).rejects.toMatchObject({code:"42501"});
  });
});


describe("onboarding privilege boundary", () => {
  it("keeps the exposed RPC as an invoker and the guarded privileged code private", async () => {
    const result = await rows("select n.nspname,p.prosecdef,has_function_privilege('anon',p.oid,'EXECUTE') as anonymous,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='claim_organization_invitation' order by n.nspname");
    expect(result).toEqual([
      {nspname:"private",prosecdef:true,anonymous:false,authenticated:true},
      {nspname:"public",prosecdef:false,anonymous:false,authenticated:true}
    ]);
  });
});


describe("task workflow board", () => {
  let taskA = "";
  it("managers create tasks and the author and timestamps come from the database", async () => {
    await as("authenticated", owner);
    const created = await rows(`insert into public.tasks(organization_id,title,priority,due_date) values ('${orgA}','Prepare term calendar','high','2026-11-10') returning id,created_by,status,completed_at`);
    taskA = String(created[0].id);
    expect(created[0]).toMatchObject({ created_by: owner, status: "todo", completed_at: null });
    expect(await rows(`select entity,action from public.audit_events where record_id='${taskA}'`)).toEqual([{ entity: "tasks", action: "INSERT" }]);
  });
  it("the browser cannot choose a task id, author or creation time", async () => {
    await as("authenticated", owner);
    await expect(db.exec(`insert into public.tasks(id,organization_id,title) values ('90000000-0000-0000-0000-000000000001','${orgA}','Forged')`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`insert into public.tasks(organization_id,title,created_by) values ('${orgA}','Forged','${staff}')`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`update public.tasks set created_at=now() where id='${taskA}'`)).rejects.toMatchObject({ code: "42501" });
  });
  it("staff can read and move tasks but cannot create, edit details or delete", async () => {
    await as("authenticated", staff);
    expect(await rows("select id from public.tasks")).toEqual([{ id: taskA }]);
    await expect(db.exec(`insert into public.tasks(organization_id,title) values ('${orgA}','Staff task')`)).rejects.toMatchObject({ code: "42501" });
    const moved = await rows(`update public.tasks set status='done' where id='${taskA}' returning status,completed_at is not null as completed`);
    expect(moved).toEqual([{ status: "done", completed: true }]);
    await expect(db.exec(`update public.tasks set title='Changed by staff' where id='${taskA}'`)).rejects.toMatchObject({ code: "42501" });
    expect(await rows(`delete from public.tasks where id='${taskA}' returning id`)).toEqual([]);
  });
  it("reopening a finished task clears its completion time", async () => {
    await as("authenticated", owner);
    expect(await rows(`update public.tasks set status='doing' where id='${taskA}' returning completed_at`)).toEqual([{ completed_at: null }]);
  });
  it("other tenants and anonymous callers cannot see or touch tasks", async () => {
    await as("authenticated", outsider);
    expect(await rows("select id from public.tasks")).toEqual([]);
    expect(await rows(`update public.tasks set status='done' where id='${taskA}' returning id`)).toEqual([]);
    await expect(db.exec(`insert into public.tasks(organization_id,title) values ('${orgA}','Cross tenant')`)).rejects.toMatchObject({ code: "42501" });
    await as("anon");
    await expect(db.exec("select id from public.tasks")).rejects.toMatchObject({ code: "42501" });
  });
  it("rejects empty titles and unknown stages", async () => {
    await as("authenticated", owner);
    await expect(db.exec(`insert into public.tasks(organization_id,title) values ('${orgA}','   ')`)).rejects.toMatchObject({ code: "23514" });
    await expect(db.exec(`update public.tasks set status='archived' where id='${taskA}'`)).rejects.toMatchObject({ code: "23514" });
  });
  it("managers delete tasks and the deletion is audited", async () => {
    await as("authenticated", owner);
    expect(await rows(`delete from public.tasks where id='${taskA}' returning id`)).toEqual([{ id: taskA }]);
    await db.exec("reset role");
    expect(await rows(`select action from public.audit_events where record_id='${taskA}' order by id`)).toEqual([{ action: "INSERT" }, { action: "UPDATE" }, { action: "UPDATE" }, { action: "DELETE" }]);
  });
});


describe("record deletion, family links, team and assignment", () => {
  const guardianA = "40000000-0000-0000-0000-000000000001";
  const childLinked = "30000000-0000-0000-0000-000000000011";
  const childEnrolled = "30000000-0000-0000-0000-000000000012";
  const invitee = "10000000-0000-0000-0000-000000000011";
  const lateInvitee = "10000000-0000-0000-0000-000000000012";
  const unverifiedInvitee = "10000000-0000-0000-0000-000000000013";
  beforeAll(async () => {
    await db.exec("reset role");
    await db.exec(`
      update auth.users set email='staff@example.com' where id='${staff}';
      insert into auth.users(id,email_confirmed_at,email) values ('${invitee}',now(),'new.teacher@example.com'),('${lateInvitee}',now(),'late@example.com'),('${unverifiedInvitee}',null,'pending@example.com');
      insert into public.guardians(id,organization_id,full_name) values ('${guardianA}','${orgA}','Guardian A');
      insert into public.children(id,organization_id,full_name) values ('${childLinked}','${orgA}','Linked child'),('${childEnrolled}','${orgA}','Enrolled child');
      insert into public.enrollments(organization_id,child_id) values ('${orgA}','${childEnrolled}');
    `);
  });

  it("only managers delete records, and deletions are audited", async () => {
    await as("authenticated", owner);
    const branch = await rows(`insert into public.branches(organization_id,name) values ('${orgA}','Temporary branch') returning id`);
    await as("authenticated", staff);
    expect(await rows(`delete from public.branches where id='${branch[0].id}' returning id`)).toEqual([]);
    await as("authenticated", outsider);
    expect(await rows(`delete from public.branches where id='${branch[0].id}' returning id`)).toEqual([]);
    await as("authenticated", owner);
    expect(await rows(`delete from public.branches where id='${branch[0].id}' returning id`)).toEqual([{ id: branch[0].id }]);
    expect(await rows(`select action from public.audit_events where record_id='${branch[0].id}' order by id`)).toEqual([{ action: "INSERT" }, { action: "DELETE" }]);
  });
  it("a child with an enrollment cannot be deleted until the enrollment is removed", async () => {
    await as("authenticated", owner);
    await expect(db.exec(`delete from public.children where id='${childEnrolled}'`)).rejects.toMatchObject({ code: "23503" });
  });
  it("only draft invoices can be deleted; issued invoices must be voided", async () => {
    await as("authenticated", owner);
    expect(await rows(`delete from public.invoices where organization_id='${orgA}' and status='issued' returning id`)).toEqual([]);
    const draft = await rows(`insert into public.invoices(organization_id,amount_sar,status) values ('${orgA}',50,'draft') returning id`);
    expect(await rows(`delete from public.invoices where id='${draft[0].id}' returning id`)).toEqual([{ id: draft[0].id }]);
  });
  it("managers link a child to a guardian of the same tenant with a known relationship", async () => {
    await as("authenticated", owner);
    await db.exec(`insert into public.child_guardians(organization_id,child_id,guardian_id,relationship) values ('${orgA}','${childLinked}','${guardianA}','mother')`);
    expect(await rows(`select action from public.audit_events where entity='child_guardians' and record_id='${childLinked}'`)).toEqual([{ action: "INSERT" }]);
    await expect(db.exec(`insert into public.child_guardians(organization_id,child_id,guardian_id,relationship) values ('${orgA}','${childA}','${guardianA}','cousin')`)).rejects.toMatchObject({ code: "23514" });
    await expect(db.exec(`insert into public.child_guardians(organization_id,child_id,guardian_id,relationship) values ('${orgA}','${childA}','${guardianB}','father')`)).rejects.toMatchObject({ code: "23503" });
  });
  it("staff and other tenants cannot create or remove family links", async () => {
    await as("authenticated", staff);
    await expect(db.exec(`insert into public.child_guardians(organization_id,child_id,guardian_id,relationship) values ('${orgA}','${childA}','${guardianA}','father')`)).rejects.toMatchObject({ code: "42501" });
    expect(await rows(`delete from public.child_guardians where child_id='${childLinked}' returning child_id`)).toEqual([]);
    await as("authenticated", outsider);
    expect(await rows(`select child_id from public.child_guardians`)).toEqual([]);
  });
  it("deleting a child removes its family links in the same step", async () => {
    await as("authenticated", owner);
    await db.exec(`delete from public.children where id='${childLinked}'`);
    await db.exec("reset role");
    expect(await rows(`select child_id from public.child_guardians where child_id='${childLinked}'`)).toEqual([]);
  });
  it("members set their own display name but not their own role", async () => {
    await as("authenticated", staff);
    expect(await rows(`update public.memberships set display_name='Sara' where user_id='${staff}' and organization_id='${orgA}' returning display_name`)).toEqual([{ display_name: "Sara" }]);
    await expect(db.exec(`update public.memberships set role='admin' where user_id='${staff}'`)).rejects.toMatchObject({ code: "42501" });
    expect(await rows(`update public.memberships set display_name='Hijack' where user_id='${owner}' returning user_id`)).toEqual([]);
  });
  it("owners change roles of others but never their own, and cannot remove themselves", async () => {
    await as("authenticated", owner);
    expect(await rows(`update public.memberships set role='admin' where user_id='${staff}' and organization_id='${orgA}' returning role`)).toEqual([{ role: "admin" }]);
    await expect(db.exec(`update public.memberships set role='staff' where user_id='${owner}' and organization_id='${orgA}'`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`delete from public.memberships where user_id='${owner}' and organization_id='${orgA}'`)).rejects.toMatchObject({ code: "42501" });
    expect(await rows(`select action from public.audit_events where entity='memberships' and record_id='${staff}'`)).toEqual([{ action: "UPDATE" }, { action: "UPDATE" }]);
  });
  it("admins cannot change roles or remove the owner, and other tenants cannot touch memberships", async () => {
    await as("authenticated", staff);
    await expect(db.exec(`delete from public.memberships where user_id='${owner}' and organization_id='${orgA}'`)).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", outsider);
    expect(await rows(`update public.memberships set display_name='x' where organization_id='${orgA}' returning user_id`)).toEqual([]);
    expect(await rows(`delete from public.memberships where organization_id='${orgA}' returning user_id`)).toEqual([]);
    await as("authenticated", owner);
    await db.exec(`update public.memberships set role='staff' where user_id='${staff}' and organization_id='${orgA}'`);
  });
  it("only managers invite, and admins may invite staff only", async () => {
    await as("authenticated", staff);
    await expect(db.exec(`select public.invite_member('${orgA}','someone@example.com','staff','x')`)).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", outsider);
    await expect(db.exec(`select public.invite_member('${orgA}','someone@example.com','staff','x')`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`select public.invite_member('${orgB}','someone@example.com','owner','x')`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`select * from public.list_member_invitations('${orgA}')`)).rejects.toMatchObject({ code: "42501" });
  });
  it("owners invite by email; repeats refresh one invitation and members cannot be invited twice", async () => {
    await as("authenticated", owner);
    await db.exec(`select public.invite_member('${orgA}','  New.Teacher@Example.com ','staff','Noura')`);
    await db.exec(`select public.invite_member('${orgA}','new.teacher@example.com','admin','Noura A')`);
    expect(await rows(`select email,role,display_name from public.list_member_invitations('${orgA}')`)).toEqual([{ email: "new.teacher@example.com", role: "admin", display_name: "Noura A" }]);
    await expect(db.exec(`select public.invite_member('${orgA}','staff@example.com','staff',null)`)).rejects.toMatchObject({ code: "23505" });
    await expect(db.exec(`select public.invite_member('${orgA}','not-an-email','staff',null)`)).rejects.toMatchObject({ code: "23514" });
    await expect(db.exec("select * from private.member_invitations")).rejects.toMatchObject({ code: "42501" });
  });
  it("a verified account claims its invitation once; unverified accounts get nothing", async () => {
    await as("authenticated", unverifiedInvitee);
    expect(await rows("select public.claim_member_invitations() as joined")).toEqual([{ joined: 0 }]);
    await as("authenticated", invitee);
    expect(await rows("select public.claim_member_invitations() as joined")).toEqual([{ joined: 1 }]);
    expect(await rows("select public.claim_member_invitations() as joined")).toEqual([{ joined: 0 }]);
    expect(await rows(`select role,display_name from public.memberships where user_id='${invitee}'`)).toEqual([{ role: "admin", display_name: "Noura A" }]);
    expect(await rows(`select entity,action from public.audit_events where entity='memberships' and record_id='${invitee}'`)).toEqual([{ entity: "memberships", action: "INSERT" }]);
  });
  it("revoked and expired invitations cannot be claimed", async () => {
    await as("authenticated", owner);
    const revoked = await rows(`select public.invite_member('${orgA}','late@example.com','staff',null) as id`);
    await db.exec(`select public.revoke_member_invitation('${revoked[0].id}')`);
    await as("authenticated", lateInvitee);
    expect(await rows("select public.claim_member_invitations() as joined")).toEqual([{ joined: 0 }]);
    await as("authenticated", owner);
    const expiring = await rows(`select public.invite_member('${orgA}','late@example.com','staff',null) as id`);
    await db.exec("reset role");
    await db.exec(`update private.member_invitations set expires_at=now()-interval '1 minute' where id='${expiring[0].id}'`);
    await as("authenticated", lateInvitee);
    expect(await rows("select public.claim_member_invitations() as joined")).toEqual([{ joined: 0 }]);
    await as("authenticated", outsider);
    await expect(db.exec(`select public.revoke_member_invitation('${expiring[0].id}')`)).rejects.toMatchObject({ code: "P0002" });
  });
  it("tasks are assigned only to members of the same organization, by managers", async () => {
    await as("authenticated", owner);
    const task = await rows(`insert into public.tasks(organization_id,title,assignee_id) values ('${orgA}','Assigned task','${staff}') returning id,assignee_id`);
    expect(task[0].assignee_id).toBe(staff);
    await expect(db.exec(`insert into public.tasks(organization_id,title,assignee_id) values ('${orgA}','Wrong person','${outsider}')`)).rejects.toMatchObject({ code: "23503" });
    await as("authenticated", staff);
    await expect(db.exec(`update public.tasks set assignee_id=null where id='${task[0].id}'`)).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", owner);
    await db.exec(`delete from public.memberships where user_id='${staff}' and organization_id='${orgA}'`);
    expect(await rows(`select assignee_id from public.tasks where id='${task[0].id}'`)).toEqual([{ assignee_id: null }]);
  });
});

describe("student files, health and attendance", () => {
  const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const yesterday = () => new Date(Date.now() + 3 * 3600_000 - 86400_000).toISOString().slice(0, 10);
  const tomorrow = () => new Date(Date.now() + 3 * 3600_000 + 86400_000).toISOString().slice(0, 10);
  beforeEach(async () => { await db.exec("reset role"); await db.exec(`delete from public.attendance; delete from public.child_health; insert into public.memberships(organization_id,user_id,role) values ('${orgA}','${staff}','staff') on conflict do nothing`); });
  it("managers write health records; staff read them; other tenants see nothing", async () => {
    await as("authenticated", owner);
    await db.exec(`insert into public.child_health(child_id,organization_id,allergies,blood_type) values ('${childA}','${orgA}','Peanuts','O+')`);
    expect(await rows(`select updated_by from public.child_health where child_id='${childA}'`)).toEqual([{ updated_by: owner }]);
    await as("authenticated", staff);
    expect(await rows("select allergies from public.child_health")).toEqual([{ allergies: "Peanuts" }]);
    await expect(db.exec(`update public.child_health set allergies='None' where child_id='${childA}'`)).resolves.toBeDefined();
    expect(await rows("select allergies from public.child_health")).toEqual([{ allergies: "Peanuts" }]);
    await as("authenticated", outsider);
    expect(await rows("select * from public.child_health")).toEqual([]);
    await expect(db.exec(`insert into public.child_health(child_id,organization_id) values ('${childA}','${orgB}')`)).rejects.toBeDefined();
    await db.exec("reset role");
    const audit = await rows(`select entity,record_id,action from public.audit_events where entity='child_health'`);
    expect(audit).toContainEqual({ entity: "child_health", record_id: childA, action: "INSERT" });
  });
  it("any member records today's attendance once per child; the recorder comes from the database", async () => {
    await as("authenticated", staff);
    await db.exec(`insert into public.attendance(organization_id,child_id,attendance_date,status) values ('${orgA}','${childA}','${today()}','present')`);
    expect(await rows("select status,recorded_by from public.attendance")).toEqual([{ status: "present", recorded_by: staff }]);
    await expect(db.exec(`insert into public.attendance(organization_id,child_id,attendance_date,status) values ('${orgA}','${childA}','${today()}','absent')`)).rejects.toMatchObject({ code: "23505" });
    await db.exec(`update public.attendance set status='late' where child_id='${childA}'`);
    expect(await rows("select status from public.attendance")).toEqual([{ status: "late" }]);
    await expect(db.exec(`insert into public.attendance(organization_id,child_id,attendance_date,status) values ('${orgA}','${childA}','${today()}','asleep')`)).rejects.toBeDefined();
  });
  it("staff cannot correct past days or delete; nobody records the future", async () => {
    await as("authenticated", staff);
    await expect(db.exec(`insert into public.attendance(organization_id,child_id,attendance_date,status) values ('${orgA}','${childA}','${yesterday()}','present')`)).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", owner);
    await expect(db.exec(`insert into public.attendance(organization_id,child_id,attendance_date,status) values ('${orgA}','${childA}','${tomorrow()}','present')`)).rejects.toMatchObject({ code: "23514" });
    await db.exec(`insert into public.attendance(organization_id,child_id,attendance_date,status) values ('${orgA}','${childA}','${yesterday()}','absent')`);
    await as("authenticated", staff);
    await expect(db.exec(`update public.attendance set status='present' where child_id='${childA}'`)).rejects.toMatchObject({ code: "42501" });
    await db.exec(`delete from public.attendance where child_id='${childA}'`);
    await as("authenticated", owner);
    expect(await rows("select status from public.attendance")).toEqual([{ status: "absent" }]);
  });
  it("attendance cannot reference another tenant's child and is invisible across tenants", async () => {
    await as("authenticated", owner);
    await expect(db.exec(`insert into public.attendance(organization_id,child_id,attendance_date,status) values ('${orgA}','${childB}','${today()}','present')`)).rejects.toBeDefined();
    await db.exec(`insert into public.attendance(organization_id,child_id,attendance_date,status) values ('${orgA}','${childA}','${today()}','present')`);
    await as("authenticated", outsider);
    expect(await rows("select * from public.attendance")).toEqual([]);
    await as("anon");
    await expect(db.exec("select * from public.attendance")).rejects.toBeDefined();
  });
});

describe("academic structure", () => {
  beforeEach(async () => {
    await db.exec("reset role");
    await db.exec(`update public.children set section_id=null; delete from public.section_staff; delete from public.sections; delete from public.grade_levels; delete from public.academic_terms; delete from public.academic_years; insert into public.memberships(organization_id,user_id,role) values ('${orgA}','${staff}','staff') on conflict do nothing`);
  });
  async function setup() {
    await as("authenticated", owner);
    const grade = await rows(`insert into public.grade_levels(organization_id,name,stage,sort_order) values ('${orgA}','KG1','kindergarten',1) returning id`);
    const section = await rows(`insert into public.sections(organization_id,grade_level_id,name,gender,homeroom_teacher_id) values ('${orgA}','${grade[0].id}','A','girls','${staff}') returning id`);
    return { grade: grade[0].id as string, section: section[0].id as string };
  }
  it("managers build grades and sections; staff read but cannot write", async () => {
    const { section } = await setup();
    await db.exec(`update public.children set section_id='${section}' where id='${childA}'`);
    await as("authenticated", staff);
    expect(await rows("select name,gender from public.sections")).toEqual([{ name: "A", gender: "girls" }]);
    await expect(db.exec(`insert into public.grade_levels(organization_id,name,stage) values ('${orgA}','KG2','kindergarten')`)).rejects.toBeDefined();
    await db.exec(`update public.sections set name='Hacked' where id='${section}'`);
    expect(await rows("select name from public.sections")).toEqual([{ name: "A" }]);
    await db.exec("reset role");
    expect(await rows(`select action from public.audit_events where entity='sections' and record_id='${section}'`)).toContainEqual({ action: "INSERT" });
  });
  it("sections, teachers and children cannot cross tenants", async () => {
    const { grade, section } = await setup();
    await expect(db.exec(`insert into public.sections(organization_id,grade_level_id,name,homeroom_teacher_id) values ('${orgA}','${grade}','B','${outsider}')`)).rejects.toMatchObject({ code: "23503" });
    await expect(db.exec(`insert into public.section_staff(organization_id,section_id,user_id) values ('${orgA}','${section}','${outsider}')`)).rejects.toMatchObject({ code: "23503" });
    await as("authenticated", outsider);
    expect(await rows("select * from public.sections")).toEqual([]);
    await expect(db.exec(`update public.children set section_id='${section}' where id='${childB}'`)).rejects.toMatchObject({ code: "23503" });
  });
  it("only one current academic year, and dates must be ordered", async () => {
    await as("authenticated", owner);
    await db.exec(`insert into public.academic_years(organization_id,name,starts_on,ends_on,is_current) values ('${orgA}','1447','2025-08-24','2026-06-20',true)`);
    await expect(db.exec(`insert into public.academic_years(organization_id,name,starts_on,ends_on,is_current) values ('${orgA}','1448','2026-08-23','2027-06-20',true)`)).rejects.toMatchObject({ code: "23505" });
    await expect(db.exec(`insert into public.academic_years(organization_id,name,starts_on,ends_on) values ('${orgA}','Bad','2026-08-23','2026-01-01')`)).rejects.toMatchObject({ code: "23514" });
  });
  it("photo consent time comes from the database and clears when consent is withdrawn", async () => {
    await as("authenticated", owner);
    await db.exec(`update public.children set photo_consent=true, photo_consent_at='2000-01-01' where id='${childA}'`);
    const given = await rows(`select photo_consent_at > now() - interval '1 minute' as fresh from public.children where id='${childA}'`);
    expect(given).toEqual([{ fresh: true }]);
    await db.exec(`update public.children set photo_consent=false where id='${childA}'`);
    expect(await rows(`select photo_consent_at from public.children where id='${childA}'`)).toEqual([{ photo_consent_at: null }]);
  });
  it("deleting a grade with sections is blocked; deleting a section frees its students", async () => {
    const { grade, section } = await setup();
    await db.exec(`update public.children set section_id='${section}' where id='${childA}'`);
    await expect(db.exec(`delete from public.grade_levels where id='${grade}'`)).rejects.toMatchObject({ code: "23503" });
    await db.exec(`delete from public.sections where id='${section}'`);
    expect(await rows(`select section_id from public.children where id='${childA}'`)).toEqual([{ section_id: null }]);
  });
});

describe("admissions", () => {
  const payload = (extra: Record<string, string> = {}) => JSON.stringify({ child_name: "Applicant Child", guardian_name: "Parent", guardian_phone: "+966500000001", relationship: "mother", ...extra }).replace(/'/g, "''");
  beforeEach(async () => {
    await db.exec("reset role");
    await db.exec(`delete from public.applications; delete from public.admission_settings`);
  });
  async function open(limit = 100) {
    await db.exec("reset role");
    await db.exec(`insert into public.admission_settings(organization_id,is_open,intro,daily_limit) values ('${orgA}',true,'Welcome',${limit})`);
  }
  it("the public can submit only while admissions are open, and cannot read applications", async () => {
    await as("anon");
    expect(await rows(`select public.admission_form('${orgA}') as form`)).toEqual([{ form: null }]);
    await expect(db.exec(`select public.submit_application('${orgA}','${payload()}'::jsonb)`)).rejects.toMatchObject({ code: "42501" });
    await open();
    await as("anon");
    const form = await rows(`select public.admission_form('${orgA}') as form`);
    expect(form[0].form).toMatchObject({ intro: "Welcome" });
    const ref = await rows(`select public.submit_application('${orgA}','${payload()}'::jsonb) as ref`);
    expect(ref[0].ref).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    await expect(db.exec("select * from public.applications")).rejects.toBeDefined();
    await expect(db.exec(`insert into public.applications(organization_id,reference,child_name,guardian_name,guardian_phone) values ('${orgA}','ABCDEFGH','x','y','+966500000000')`)).rejects.toBeDefined();
  });
  it("families see only status with the right reference and phone", async () => {
    await open();
    await as("anon");
    const ref = (await rows(`select public.submit_application('${orgA}','${payload()}'::jsonb) as ref`))[0].ref as string;
    expect(await rows(`select status,organization_name from public.application_status('${ref.toLowerCase()}','+966500000001')`)).toMatchObject([{ status: "new" }]);
    expect(await rows(`select * from public.application_status('${ref}','+966500000009')`)).toEqual([]);
  });
  it("the daily limit stops floods, and grades must belong to the organization", async () => {
    await open(1);
    await as("anon");
    await db.exec(`select public.submit_application('${orgA}','${payload()}'::jsonb)`);
    await expect(db.exec(`select public.submit_application('${orgA}','${payload()}'::jsonb)`)).rejects.toMatchObject({ code: "54000" });
    await db.exec("reset role");
    await db.exec(`update public.admission_settings set daily_limit=100`);
    await as("anon");
    await expect(db.exec(`select public.submit_application('${orgA}','${payload({ grade_level_id: branchB })}'::jsonb)`)).rejects.toMatchObject({ code: "23503" });
    await expect(db.exec(`select public.submit_application('${orgA}','${payload({ guardian_phone: "bad" })}'::jsonb)`)).rejects.toBeDefined();
  });
  it("only managers of the same organization review applications", async () => {
    await open();
    await as("anon");
    await db.exec(`select public.submit_application('${orgA}','${payload()}'::jsonb)`);
    await as("authenticated", staff);
    expect(await rows("select * from public.applications")).toEqual([]);
    await as("authenticated", outsider);
    expect(await rows("select * from public.applications")).toEqual([]);
    await as("authenticated", owner);
    await db.exec(`update public.applications set status='interview', staff_notes='Call Sunday'`);
    expect(await rows("select status from public.applications")).toEqual([{ status: "interview" }]);
    await expect(db.exec(`update public.applications set status='enrolled'`)).rejects.toMatchObject({ code: "23514" });
    await expect(db.exec(`update public.applications set guardian_phone='+966511111111'`)).rejects.toBeDefined();
  });
  it("conversion creates the child, guardian, link and enrolment once", async () => {
    await open();
    await as("anon");
    await db.exec(`select public.submit_application('${orgA}','${payload()}'::jsonb)`);
    await as("authenticated", owner);
    const app = (await rows("select id from public.applications"))[0].id as string;
    const child = (await rows(`select public.convert_application('${app}') as id`))[0].id as string;
    expect(await rows(`select full_name from public.children where id='${child}'`)).toEqual([{ full_name: "Applicant Child" }]);
    expect(await rows(`select relationship from public.child_guardians where child_id='${child}'`)).toEqual([{ relationship: "mother" }]);
    expect(await rows(`select status from public.enrollments where child_id='${child}'`)).toEqual([{ status: "approved" }]);
    expect(await rows(`select status,child_id from public.applications where id='${app}'`)).toEqual([{ status: "enrolled", child_id: child }]);
    await expect(db.exec(`select public.convert_application('${app}')`)).rejects.toMatchObject({ code: "23505" });
    await as("authenticated", outsider);
    await expect(db.exec(`select public.convert_application('${app}')`)).rejects.toMatchObject({ code: "P0002" });
  });
});

describe("class summaries", () => {
  it("count per section inside the tenant only", async () => {
    await db.exec("reset role");
    await db.exec(`delete from public.attendance; update public.children set section_id=null; delete from public.sections; delete from public.grade_levels`);
    await as("authenticated", owner);
    const grade = (await rows(`insert into public.grade_levels(organization_id,name,stage) values ('${orgA}','G1','primary') returning id`))[0].id;
    const section = (await rows(`insert into public.sections(organization_id,grade_level_id,name,capacity) values ('${orgA}','${grade}','A',20) returning id`))[0].id;
    await db.exec(`update public.children set section_id='${section}' where id='${childA}'`);
    const day = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
    await db.exec(`insert into public.attendance(organization_id,child_id,attendance_date,status) values ('${orgA}','${childA}','${day}','late')`);
    expect(await rows(`select section_id,total::int from public.section_enrollment('${orgA}') where section_id is not null`)).toEqual([{ section_id: section, total: 1 }]);
    expect(await rows(`select section_id,status,total::int from public.section_attendance_summary('${orgA}','${day}','${day}')`)).toEqual([{ section_id: section, status: "late", total: 1 }]);
    await expect(db.exec(`select * from public.section_attendance_summary('${orgA}','2026-01-01','2026-06-01')`)).rejects.toMatchObject({ code: "22023" });
    await as("authenticated", outsider);
    expect(await rows(`select * from public.section_enrollment('${orgA}')`)).toEqual([]);
    expect(await rows(`select * from public.section_attendance_summary('${orgA}','${day}','${day}')`)).toEqual([]);
    await as("anon");
    await expect(db.exec(`select * from public.section_enrollment('${orgA}')`)).rejects.toBeDefined();
  });
});

describe("my work: task comments and inquiries", () => {
  beforeEach(async () => {
    await db.exec("reset role");
    await db.exec(`delete from public.inquiry_replies; delete from public.inquiries; delete from public.task_comments; insert into public.memberships(organization_id,user_id,role) values ('${orgA}','${staff}','staff') on conflict do nothing`);
  });
  it("members comment on tasks as themselves; other tenants see nothing", async () => {
    await as("authenticated", owner);
    const task = (await rows(`insert into public.tasks(organization_id,title,assignee_id) values ('${orgA}','Prepare report','${staff}') returning id`))[0].id;
    await as("authenticated", staff);
    await db.exec(`insert into public.task_comments(organization_id,task_id,body) values ('${orgA}','${task}','Started')`);
    expect(await rows(`select author_id,body from public.task_comments where task_id='${task}'`)).toEqual([{ author_id: staff, body: "Started" }]);
    await expect(db.exec(`insert into public.task_comments(organization_id,task_id,body,author_id) values ('${orgA}','${task}','Forged','${owner}')`)).rejects.toThrow("permission denied");
    await as("authenticated", outsider);
    expect(await rows("select * from public.task_comments")).toEqual([]);
    await expect(db.exec(`insert into public.task_comments(organization_id,task_id,body) values ('${orgA}','${task}','x')`)).rejects.toBeDefined();
  });
  it("inquiries are private to their author and managers, and replies drive the status", async () => {
    await as("authenticated", staff);
    const inquiry = (await rows(`insert into public.inquiries(organization_id,category,subject,body) values ('${orgA}','supplies','Markers','Need markers') returning id,author_id,status`))[0];
    expect(inquiry).toMatchObject({ author_id: staff, status: "open" });
    await as("authenticated", outsider);
    expect(await rows("select * from public.inquiries")).toEqual([]);
    await as("authenticated", owner);
    expect(await rows("select subject from public.inquiries")).toEqual([{ subject: "Markers" }]);
    await db.exec(`insert into public.inquiry_replies(organization_id,inquiry_id,body) values ('${orgA}','${inquiry.id}','Ordered')`);
    expect(await rows(`select status from public.inquiries where id='${inquiry.id}'`)).toEqual([{ status: "answered" }]);
    await as("authenticated", staff);
    expect(await rows(`select body,author_id from public.inquiry_replies where inquiry_id='${inquiry.id}'`)).toEqual([{ body: "Ordered", author_id: owner }]);
    await db.exec(`insert into public.inquiry_replies(organization_id,inquiry_id,body) values ('${orgA}','${inquiry.id}','Thanks, when?')`);
    expect(await rows(`select status from public.inquiries where id='${inquiry.id}'`)).toEqual([{ status: "open" }]);
    await expect(db.exec(`update public.inquiries set status='answered' where id='${inquiry.id}'`)).rejects.toMatchObject({ code: "42501" });
    await db.exec(`update public.inquiries set status='closed' where id='${inquiry.id}'`);
    await expect(db.exec(`insert into public.inquiry_replies(organization_id,inquiry_id,body) values ('${orgA}','${inquiry.id}','after close')`)).rejects.toBeDefined();
  });
  it("staff cannot read another member's inquiry", async () => {
    await as("authenticated", owner);
    await db.exec(`insert into public.inquiries(organization_id,subject,body) values ('${orgA}','Manager note','Private')`);
    await as("authenticated", staff);
    expect(await rows("select * from public.inquiries")).toEqual([]);
  });
});

describe("member contacts", () => {
  it("phones are private to the member and managers; only managers read contacts", async () => {
    await db.exec("reset role");
    await db.exec(`delete from public.member_phones; update auth.users set email='staff@example.com' where id='${staff}'; insert into public.memberships(organization_id,user_id,role) values ('${orgA}','${staff}','staff') on conflict do nothing`);
    await as("authenticated", staff);
    await db.exec(`insert into public.member_phones(organization_id,user_id,phone) values ('${orgA}','${staff}','+966500000002')`);
    await expect(db.exec(`insert into public.member_phones(organization_id,user_id,phone) values ('${orgA}','${owner}','+966500000009')`)).rejects.toBeDefined();
    await expect(db.exec(`update public.member_phones set phone='bad' where user_id='${staff}'`)).rejects.toBeDefined();
    await expect(db.exec(`select * from public.member_contacts('${orgA}')`)).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", owner);
    expect(await rows(`select email,phone from public.member_contacts('${orgA}') where user_id='${staff}'`)).toEqual([{ email: "staff@example.com", phone: "+966500000002" }]);
    await db.exec(`insert into public.member_phones(organization_id,user_id,phone) values ('${orgA}','${owner}','+966500000001')`);
    await as("authenticated", staff);
    expect(await rows("select user_id from public.member_phones")).toEqual([{ user_id: staff }]);
    await as("authenticated", outsider);
    expect(await rows("select * from public.member_phones")).toEqual([]);
    await expect(db.exec(`select * from public.member_contacts('${orgA}')`)).rejects.toMatchObject({ code: "42501" });
    await as("anon");
    await expect(db.exec(`select * from public.member_contacts('${orgA}')`)).rejects.toBeDefined();
  });
});

describe("student pickup", () => {
  const guardianA = "40000000-0000-0000-0000-00000000000a";
  beforeEach(async () => {
    await db.exec("reset role");
    await db.exec(`delete from public.pickups; delete from public.authorized_pickups; insert into public.memberships(organization_id,user_id,role) values ('${orgA}','${staff}','staff') on conflict do nothing;
      insert into public.guardians(id,organization_id,full_name) values ('${guardianA}','${orgA}','Mother A') on conflict do nothing;
      insert into public.child_guardians(organization_id,child_id,guardian_id,relationship) values ('${orgA}','${childA}','${guardianA}','mother') on conflict do nothing`);
  });
  it("staff hand a child to a linked guardian once a day; the record is stamped by the database", async () => {
    await as("authenticated", staff);
    const row = (await rows(`insert into public.pickups(organization_id,child_id,guardian_id) values ('${orgA}','${childA}','${guardianA}') returning picked_by_name,handed_by`))[0];
    expect(row).toEqual({ picked_by_name: "Mother A", handed_by: staff });
    await expect(db.exec(`insert into public.pickups(organization_id,child_id,guardian_id) values ('${orgA}','${childA}','${guardianA}')`)).rejects.toMatchObject({ code: "23505" });
    await db.exec(`delete from public.pickups where child_id='${childA}'`);
    expect(await rows("select * from public.pickups")).toEqual([]);
  });
  it("only linked guardians or active authorized people can collect", async () => {
    await as("authenticated", owner);
    const other = (await rows(`insert into public.guardians(organization_id,full_name) values ('${orgA}','Stranger') returning id`))[0].id;
    const driver = (await rows(`insert into public.authorized_pickups(organization_id,child_id,full_name,relationship) values ('${orgA}','${childA}','Driver','سائق') returning id`))[0].id;
    await as("authenticated", staff);
    await expect(db.exec(`insert into public.pickups(organization_id,child_id,guardian_id) values ('${orgA}','${childA}','${other}')`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`insert into public.authorized_pickups(organization_id,child_id,full_name,relationship) values ('${orgA}','${childA}','Self added','x')`)).rejects.toBeDefined();
    await as("authenticated", owner);
    await db.exec(`update public.authorized_pickups set is_active=false where id='${driver}'`);
    await as("authenticated", staff);
    await expect(db.exec(`insert into public.pickups(organization_id,child_id,authorized_id) values ('${orgA}','${childA}','${driver}')`)).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", owner);
    await db.exec(`update public.authorized_pickups set is_active=true where id='${driver}'`);
    await as("authenticated", staff);
    expect(await rows(`insert into public.pickups(organization_id,child_id,authorized_id) values ('${orgA}','${childA}','${driver}') returning picked_by_name`)).toEqual([{ picked_by_name: "Driver" }]);
  });
  it("other tenants see nothing", async () => {
    await as("authenticated", staff);
    await db.exec(`insert into public.pickups(organization_id,child_id,guardian_id) values ('${orgA}','${childA}','${guardianA}')`);
    await as("authenticated", outsider);
    expect(await rows("select * from public.pickups")).toEqual([]);
    expect(await rows("select * from public.authorized_pickups")).toEqual([]);
  });
});

describe("finance", () => {
  beforeEach(async () => {
    await db.exec("reset role");
    await db.exec(`delete from public.payments; delete from public.invoice_lines; delete from public.invoices; delete from public.fee_plan_items; delete from public.fee_plans; delete from public.fee_items; delete from public.discounts; insert into public.memberships(organization_id,user_id,role) values ('${orgA}','${staff}','staff') on conflict do nothing`);
  });
  async function draft(relief = false) {
    await as("authenticated", owner);
    const inv = (await rows(`insert into public.invoices(organization_id,amount_sar,title,vat_borne_by_state) values ('${orgA}',0,'Term 1',${relief}) returning id`))[0].id as string;
    await db.exec(`insert into public.invoice_lines(organization_id,invoice_id,description,kind,quantity,unit_price,discount,vat_rate) values
      ('${orgA}','${inv}','Tuition','tuition',1,10000,1000,15),('${orgA}','${inv}','Books','books',2,250,0,15)`);
    return inv;
  }
  it("totals, VAT and relief are computed by the database", async () => {
    const inv = await draft();
    expect(await rows(`select subtotal,discount_total,vat_total,vat_relief,amount_sar from public.invoices where id='${inv}'`))
      .toEqual([{ subtotal: "10500.00", discount_total: "1000.00", vat_total: "1425.00", vat_relief: "0.00", amount_sar: "10925.00" }]);
    await db.exec(`update public.invoices set vat_borne_by_state=true where id='${inv}'`);
    expect(await rows(`select vat_total,vat_relief,amount_sar from public.invoices where id='${inv}'`))
      .toEqual([{ vat_total: "1425.00", vat_relief: "1350.00", amount_sar: "9575.00" }]);
    await expect(db.exec(`update public.invoices set subtotal=1, paid_total=99999 where id='${inv}'`)).rejects.toThrow("permission denied");
    await db.exec(`update public.invoices set amount_sar=1 where id='${inv}'`);
    expect(await rows(`select amount_sar,subtotal,paid_total from public.invoices where id='${inv}'`)).toEqual([{ amount_sar: "9575.00", subtotal: "10500.00", paid_total: "0.00" }]);
  });
  it("issuing numbers invoices in sequence and freezes them", async () => {
    const a = await draft(), b = await draft();
    await db.exec(`update public.invoices set status='issued' where id='${a}'`);
    await db.exec(`update public.invoices set status='issued' where id='${b}'`);
    const numbers = await rows(`select number from public.invoices where id in ('${a}','${b}') order by number`);
    expect(numbers.map(row => row.number)).toEqual([(numbers[0].number as number), (numbers[0].number as number) + 1]);
    await expect(db.exec(`insert into public.invoice_lines(organization_id,invoice_id,description,unit_price) values ('${orgA}','${a}','Extra',10)`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`update public.invoices set title='Changed' where id='${a}'`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`update public.invoices set status='draft' where id='${a}'`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`update public.invoices set status='paid' where id='${a}'`)).rejects.toMatchObject({ code: "23514" });
  });
  it("payments: issued only, never above balance, full payment marks paid, removal reopens", async () => {
    const inv = await draft();
    await expect(db.exec(`insert into public.payments(organization_id,invoice_id,amount,method,paid_on) values ('${orgA}','${inv}',100,'cash',current_date)`)).rejects.toMatchObject({ code: "23514" });
    await db.exec(`update public.invoices set status='issued' where id='${inv}'`);
    await db.exec(`insert into public.payments(organization_id,invoice_id,amount,method,paid_on) values ('${orgA}','${inv}',5000,'mada',current_date)`);
    expect(await rows(`select status,paid_total from public.invoices where id='${inv}'`)).toEqual([{ status: "issued", paid_total: "5000.00" }]);
    await expect(db.exec(`insert into public.payments(organization_id,invoice_id,amount,method,paid_on) values ('${orgA}','${inv}',99999,'cash',current_date)`)).rejects.toMatchObject({ code: "23514" });
    await expect(db.exec(`update public.invoices set status='void' where id='${inv}'`)).rejects.toMatchObject({ code: "23514" });
    const last = (await rows(`insert into public.payments(organization_id,invoice_id,amount,method,paid_on) values ('${orgA}','${inv}',5925,'bank_transfer',current_date) returning id,receipt_number,recorded_by`))[0];
    expect(last.recorded_by).toBe(owner);
    expect(await rows(`select status,paid_total from public.invoices where id='${inv}'`)).toEqual([{ status: "paid", paid_total: "10925.00" }]);
    await expect(db.exec(`update public.payments set amount=1 where id='${last.id}'`)).rejects.toBeDefined();
    await db.exec(`delete from public.payments where id='${last.id}'`);
    expect(await rows(`select status,paid_total from public.invoices where id='${inv}'`)).toEqual([{ status: "issued", paid_total: "5000.00" }]);
  });
  it("staff and other tenants cannot see or touch finance", async () => {
    const inv = await draft();
    await db.exec(`insert into public.fee_items(organization_id,name,kind,default_amount) values ('${orgA}','Tuition','tuition',10000)`);
    for (const user of [staff, outsider]) {
      await as("authenticated", user);
      expect(await rows("select * from public.invoice_lines")).toEqual([]);
      expect(await rows("select * from public.fee_items")).toEqual([]);
      expect(await rows("select * from public.payments")).toEqual([]);
      await expect(db.exec(`insert into public.payments(organization_id,invoice_id,amount,method,paid_on) values ('${orgA}','${inv}',1,'cash',current_date)`)).rejects.toBeDefined();
    }
    await as("anon");
    await expect(db.exec("select * from public.payments")).rejects.toBeDefined();
  });
  it("plans reference only the organization's own items and grades", async () => {
    await as("authenticated", owner);
    const item = (await rows(`insert into public.fee_items(organization_id,name,kind,default_amount) values ('${orgA}','Tuition','tuition',10000) returning id`))[0].id;
    const plan = (await rows(`insert into public.fee_plans(organization_id,name,installments) values ('${orgA}','KG plan',3) returning id`))[0].id;
    await db.exec(`insert into public.fee_plan_items(organization_id,fee_plan_id,fee_item_id,amount) values ('${orgA}','${plan}','${item}',9000)`);
    await as("authenticated", outsider);
    await expect(db.exec(`insert into public.fee_plan_items(organization_id,fee_plan_id,fee_item_id,amount) values ('${orgB}','${plan}','${item}',1)`)).rejects.toBeDefined();
    await as("authenticated", owner);
    await expect(db.exec(`insert into public.discounts(organization_id,name,kind,value) values ('${orgA}','Too much','percent',150)`)).rejects.toMatchObject({ code: "23514" });
  });
});

describe("finance plan invoices", () => {
  it("splits a plan into installments per student and applies discounts", async () => {
    await db.exec("reset role");
    await db.exec(`delete from public.payments; delete from public.invoice_lines; delete from public.invoices; delete from public.fee_plan_items; delete from public.fee_plans; delete from public.fee_items; delete from public.discounts; update public.children set section_id=null; delete from public.sections; delete from public.grade_levels`);
    await as("authenticated", owner);
    const grade = (await rows(`insert into public.grade_levels(organization_id,name,stage) values ('${orgA}','G1','primary') returning id`))[0].id;
    const section = (await rows(`insert into public.sections(organization_id,grade_level_id,name) values ('${orgA}','${grade}','A') returning id`))[0].id;
    await db.exec(`update public.children set section_id='${section}' where id='${childA}'`);
    const item = (await rows(`insert into public.fee_items(organization_id,name,kind,default_amount,vat_rate) values ('${orgA}','Tuition','tuition',1000,15) returning id`))[0].id;
    const plan = (await rows(`insert into public.fee_plans(organization_id,name,installments) values ('${orgA}','Plan',3) returning id`))[0].id;
    await db.exec(`insert into public.fee_plan_items(organization_id,fee_plan_id,fee_item_id,amount) values ('${orgA}','${plan}','${item}',1000)`);
    const discount = (await rows(`insert into public.discounts(organization_id,name,reason,kind,value) values ('${orgA}','Sibling','sibling','percent',10) returning id`))[0].id;
    expect(await rows(`select public.generate_plan_invoices('${plan}','${section}',null,'2026-09-01',1,'${discount}',true) as n`)).toEqual([{ n: 3 }]);
    const invoices = await rows(`select due_date::text as due, subtotal, discount_total, status from public.invoices where child_id='${childA}' order by due_date`);
    expect(invoices.map(row => row.due)).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"]);
    expect(invoices.map(row => row.subtotal)).toEqual(["333.33", "333.33", "333.34"]);
    expect(invoices.every(row => row.status === "issued")).toBe(true);
    await as("authenticated", outsider);
    await expect(db.exec(`select public.generate_plan_invoices('${plan}','${section}',null,'2026-09-01')`)).rejects.toMatchObject({ code: "P0002" });
  });
});

describe("live class history", () => {
  const childC = "30000000-0000-0000-0000-00000000000c";
  beforeEach(async () => {
    await db.exec("reset role");
    await db.exec(`delete from public.attendance; delete from public.attendance_events; insert into public.memberships(organization_id,user_id,role) values ('${orgA}','${staff}','staff') on conflict do nothing`);
  });
  it("every attendance change is logged with who made it, and members cannot write the log", async () => {
    await as("authenticated", staff);
    const today = (await rows("select (now() at time zone 'Asia/Riyadh')::date::text as d"))[0].d as string;
    await db.exec(`insert into public.attendance(organization_id,child_id,attendance_date,status) values ('${orgA}','${childA}','${today}','absent')`);
    await db.exec(`update public.attendance set status='late' where child_id='${childA}'`);
    await db.exec(`update public.attendance set note='traffic' where child_id='${childA}'`);
    expect(await rows("select from_status,to_status,actor_id from public.attendance_events order by id")).toEqual([
      { from_status: null, to_status: "absent", actor_id: staff },
      { from_status: "absent", to_status: "late", actor_id: staff },
    ]);
    await expect(db.exec(`insert into public.attendance_events(organization_id,child_id,attendance_date,to_status) values ('${orgA}','${childA}','${today}','present')`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec("delete from public.attendance_events")).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec("update public.attendance_events set to_status='present'")).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", outsider);
    expect(await rows("select * from public.attendance_events")).toEqual([]);
  });
  it("removing an entry is logged, and deleting a child removes its history without failing", async () => {
    await db.exec(`insert into public.children(id,organization_id,full_name) values ('${childC}','${orgA}','Temp Child')`);
    await as("authenticated", owner);
    const today = (await rows("select (now() at time zone 'Asia/Riyadh')::date::text as d"))[0].d as string;
    await db.exec(`insert into public.attendance(organization_id,child_id,attendance_date,status) values ('${orgA}','${childC}','${today}','present')`);
    await db.exec(`delete from public.attendance where child_id='${childC}'`);
    expect(await rows(`select from_status,to_status from public.attendance_events where child_id='${childC}' order by id`)).toEqual([
      { from_status: null, to_status: "present" }, { from_status: "present", to_status: null },
    ]);
    await db.exec(`insert into public.attendance(organization_id,child_id,attendance_date,status) values ('${orgA}','${childC}','${today}','late')`);
    await db.exec("reset role");
    await db.exec(`delete from public.children where id='${childC}'`);
    expect(await rows(`select * from public.attendance_events where child_id='${childC}'`)).toEqual([]);
  });
});

describe("branded documents and quotes", () => {
  const guardianQ = "40000000-0000-0000-0000-0000000000b1";
  beforeEach(async () => {
    await db.exec("reset role");
    await db.exec(`delete from public.quotes; delete from public.organization_profiles; delete from public.payments; delete from public.invoice_lines; delete from public.invoices;
      insert into public.memberships(organization_id,user_id,role) values ('${orgA}','${staff}','staff') on conflict do nothing;
      insert into public.guardians(id,organization_id,full_name,phone) values ('${guardianQ}','${orgA}','Quote Parent','0500000999') on conflict do nothing`);
  });
  async function draftQuote() {
    await as("authenticated", owner);
    const id = (await rows(`insert into public.quotes(organization_id,guardian_id,child_id,title,valid_until) values ('${orgA}','${guardianQ}','${childA}','Term fees','2030-01-01') returning id`))[0].id as string;
    await db.exec(`insert into public.quote_lines(organization_id,quote_id,description,kind,quantity,unit_price,discount,vat_rate) values
      ('${orgA}','${id}','Tuition','tuition',1,1000,100,15),('${orgA}','${id}','Meals','meals',2,50,0,15)`);
    return id;
  }
  it("managers keep a validated profile; staff can read it but not change it", async () => {
    await as("authenticated", owner);
    await db.exec(`insert into public.organization_profiles(organization_id,legal_name,cr_number,vat_number,iban,brand_color) values ('${orgA}','School A LLC','1010101010','300000000000003','SA0380000000608010167519','#112233')`);
    await expect(db.exec(`update public.organization_profiles set vat_number='123' where organization_id='${orgA}'`)).rejects.toMatchObject({ code: "23514" });
    await expect(db.exec(`update public.organization_profiles set logo_data='data:image/svg+xml;base64,PHN2Zz4=' where organization_id='${orgA}'`)).rejects.toMatchObject({ code: "23514" });
    await db.exec(`update public.organization_profiles set logo_data='data:image/png;base64,iVBORw0KGgo=' where organization_id='${orgA}'`);
    await as("authenticated", staff);
    expect(await rows("select legal_name from public.organization_profiles")).toEqual([{ legal_name: "School A LLC" }]);
    await db.exec(`update public.organization_profiles set legal_name='Hacked' where organization_id='${orgA}'`);
    await as("authenticated", outsider);
    expect(await rows("select * from public.organization_profiles")).toEqual([]);
    await as("authenticated", owner);
    expect(await rows("select legal_name from public.organization_profiles")).toEqual([{ legal_name: "School A LLC" }]);
  });
  it("quotes total like invoices, number on sending, freeze, and convert once into an invoice", async () => {
    const id = await draftQuote();
    expect(await rows(`select subtotal,discount_total,vat_total,total,number,status from public.quotes where id='${id}'`)).toEqual([{ subtotal: "1100.00", discount_total: "100.00", vat_total: "150.00", total: "1150.00", number: null, status: "draft" }]);
    await expect(db.exec(`update public.quotes set total=1 where id='${id}'`)).rejects.toMatchObject({ code: "42501" });
    await db.exec(`update public.quotes set status='sent' where id='${id}'`);
    expect((await rows(`select number from public.quotes where id='${id}'`))[0].number).toBe(1);
    await expect(db.exec(`update public.quote_lines set unit_price=1 where quote_id='${id}'`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`update public.quotes set title='Changed' where id='${id}'`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`update public.quotes set status='invoiced' where id='${id}'`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`delete from public.quotes where id='${id}'`)).resolves.toBeDefined();
    expect(await rows(`select count(*)::int as n from public.quotes where id='${id}'`)).toEqual([{ n: 1 }]);
    await db.exec(`update public.quotes set status='accepted' where id='${id}'`);
    const invoice = (await rows(`select public.quote_to_invoice('${id}', true) as id`))[0].id as string;
    expect(await rows(`select status,amount_sar,number is not null as numbered,guardian_id from public.invoices where id='${invoice}'`)).toEqual([{ status: "issued", amount_sar: "1150.00", numbered: true, guardian_id: guardianQ }]);
    expect(await rows(`select status,invoice_id from public.quotes where id='${id}'`)).toEqual([{ status: "invoiced", invoice_id: invoice }]);
    await expect(db.exec(`select public.quote_to_invoice('${id}', true)`)).rejects.toMatchObject({ code: "23514" });
    await as("authenticated", staff);
    expect(await rows("select * from public.quotes")).toEqual([]);
    await expect(db.exec(`select public.quote_to_invoice('${id}', true)`)).rejects.toMatchObject({ code: "P0002" });
  });
  it("share links show only sent documents, survive no tampering, and can be renewed by managers", async () => {
    const id = await draftQuote();
    const token = (await rows(`select share_token from public.quotes where id='${id}'`))[0].share_token as string;
    await as("anon");
    expect((await rows(`select public.shared_document('${token}') as d`))[0].d).toBeNull();
    await as("authenticated", owner);
    await db.exec(`update public.quotes set status='sent' where id='${id}'`);
    await expect(db.exec(`update public.quotes set share_token=gen_random_uuid() where id='${id}'`)).rejects.toMatchObject({ code: "42501" });
    await as("anon");
    const shared = (await rows(`select public.shared_document('${token}') as d`))[0].d as { kind: string; document: { total: number; recipient: string }; lines: unknown[]; organization: { name: string } };
    expect(shared.kind).toBe("quote");
    expect(shared.document).toMatchObject({ total: 1150, recipient: "Quote Parent" });
    expect(shared.lines).toHaveLength(2);
    expect(typeof shared.organization.name).toBe("string");
    await expect(db.exec(`select public.renew_share_token('quote','${id}')`)).rejects.toBeDefined();
    await as("authenticated", staff);
    await expect(db.exec(`select public.renew_share_token('quote','${id}')`)).rejects.toMatchObject({ code: "P0002" });
    await as("authenticated", owner);
    const fresh = (await rows(`select public.renew_share_token('quote','${id}') as t`))[0].t as string;
    expect(fresh).not.toBe(token);
    await as("anon");
    expect((await rows(`select public.shared_document('${token}') as d`))[0].d).toBeNull();
    expect((await rows(`select public.shared_document('${fresh}') as d`))[0].d).not.toBeNull();
    await expect(db.exec("select * from public.quotes")).rejects.toBeDefined();
  });
  it("invoice links appear once issued and include payments", async () => {
    await as("authenticated", owner);
    const inv = (await rows(`insert into public.invoices(organization_id,guardian_id,child_id,amount_sar,status,title) values ('${orgA}','${guardianQ}','${childA}',0,'draft','Fees') returning id,share_token`))[0] as { id: string; share_token: string };
    await db.exec(`insert into public.invoice_lines(organization_id,invoice_id,description,kind,quantity,unit_price,vat_rate) values ('${orgA}','${inv.id}','Books','books',1,200,15)`);
    await as("anon");
    expect((await rows(`select public.shared_document('${inv.share_token}') as d`))[0].d).toBeNull();
    await as("authenticated", owner);
    await db.exec(`update public.invoices set status='issued' where id='${inv.id}'`);
    await db.exec(`insert into public.payments(organization_id,invoice_id,amount,method,paid_on) values ('${orgA}','${inv.id}',100,'mada',(now() at time zone 'Asia/Riyadh')::date)`);
    await as("anon");
    const shared = (await rows(`select public.shared_document('${inv.share_token}') as d`))[0].d as { kind: string; document: { total: number; paid_total: number }; payments: unknown[] };
    expect(shared).toMatchObject({ kind: "invoice", document: { total: 230, paid_total: 100 } });
    expect(shared.payments).toHaveLength(1);
    expect((await rows(`select public.shared_document('00000000-0000-0000-0000-000000000000') as d`))[0].d).toBeNull();
  });
});

describe("family portal, daily reports and announcements", () => {
  const parent = "40000000-0000-0000-0000-0000000000c1";
  const otherKid = "30000000-0000-0000-0000-0000000000c2";
  beforeEach(async () => {
    await db.exec("reset role");
    await db.exec(`delete from public.daily_reports; delete from public.announcements; delete from private.guardian_portals;
      insert into public.memberships(organization_id,user_id,role) values ('${orgA}','${staff}','staff') on conflict do nothing;
      insert into public.guardians(id,organization_id,full_name) values ('${parent}','${orgA}','Portal Parent') on conflict do nothing;
      insert into public.children(id,organization_id,full_name) values ('${otherKid}','${orgA}','Someone Else') on conflict do nothing;
      insert into public.child_guardians(organization_id,child_id,guardian_id,relationship) values ('${orgA}','${childA}','${parent}','mother') on conflict do nothing`);
  });
  const today = async () => (await rows("select (now() at time zone 'Asia/Riyadh')::date::text as d"))[0].d as string;
  it("staff write today's report once per child; past days are for managers; the author is stamped", async () => {
    await as("authenticated", staff);
    const day = await today();
    expect(await rows(`insert into public.daily_reports(organization_id,child_id,report_date,mood,lunch,nap_minutes) values ('${orgA}','${childA}','${day}','happy','all',60) returning updated_by`)).toEqual([{ updated_by: staff }]);
    await expect(db.exec(`insert into public.daily_reports(organization_id,child_id,report_date) values ('${orgA}','${childA}','${day}')`)).rejects.toMatchObject({ code: "23505" });
    await expect(db.exec(`insert into public.daily_reports(organization_id,child_id,report_date) values ('${orgA}','${childA}','2020-01-01')`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`update public.daily_reports set mood='sad' where child_id='${childA}'`)).rejects.toMatchObject({ code: "23514" });
    await as("authenticated", outsider);
    expect(await rows("select * from public.daily_reports")).toEqual([]);
  });
  it("only managers publish announcements", async () => {
    await as("authenticated", staff);
    await expect(db.exec(`insert into public.announcements(organization_id,title,body) values ('${orgA}','Hi','Body')`)).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", owner);
    expect(await rows(`insert into public.announcements(organization_id,title,body,audience) values ('${orgA}','Trip','Bring hats','families') returning created_by`)).toEqual([{ created_by: owner }]);
    await as("authenticated", staff);
    expect(await rows("select title from public.announcements")).toEqual([{ title: "Trip" }]);
  });
  it("a guardian's link shows only their own children and family announcements; managers can renew it", async () => {
    await as("authenticated", owner);
    const day = await today();
    await db.exec(`insert into public.daily_reports(organization_id,child_id,report_date,mood) values ('${orgA}','${childA}','${day}','calm'),('${orgA}','${otherKid}','${day}','upset')`);
    await db.exec(`insert into public.announcements(organization_id,title,body,audience) values ('${orgA}','Families','For parents','families'),('${orgA}','Staff only','Meeting','staff')`);
    const token = (await rows(`select public.guardian_portal_token('${parent}') as t`))[0].t as string;
    expect((await rows(`select public.guardian_portal_token('${parent}') as t`))[0].t).toBe(token);
    await as("authenticated", staff);
    await expect(db.exec(`select public.guardian_portal_token('${parent}')`)).rejects.toMatchObject({ code: "P0002" });
    await expect(db.exec("select * from private.guardian_portals")).rejects.toBeDefined();
    await as("anon");
    const portal = (await rows(`select public.family_portal('${token}') as p`))[0].p as { guardian: string; children: { name: string; reports: { mood: string }[] }[]; announcements: { title: string }[] };
    expect(portal.guardian).toBe("Portal Parent");
    expect(portal.children.map(child => child.name)).toEqual(["Private Child A"]);
    expect(portal.children[0].reports[0].mood).toBe("calm");
    expect(portal.announcements.map(item => item.title)).toEqual(["Families"]);
    expect((await rows("select public.family_portal(gen_random_uuid()) as p"))[0].p).toBeNull();
    await as("authenticated", owner);
    const fresh = (await rows(`select public.guardian_portal_token('${parent}', true) as t`))[0].t as string;
    expect(fresh).not.toBe(token);
    await as("anon");
    expect((await rows(`select public.family_portal('${token}') as p`))[0].p).toBeNull();
  });
});

describe("staff files, leave, attendance and payroll", () => {
  let mine: string; let other: string;
  beforeEach(async () => {
    await db.exec("reset role");
    await db.exec(`delete from public.payroll_runs; delete from public.staff_profiles;
      insert into public.memberships(organization_id,user_id,role) values ('${orgA}','${staff}','staff') on conflict do nothing`);
    await as("authenticated", owner);
    mine = (await rows(`insert into public.staff_profiles(organization_id,user_id,full_name,basic_salary,housing_allowance,transport_allowance,gosi_rate) values ('${orgA}','${staff}','Teacher Mona',6000,1500,500,9.75) returning id`))[0].id as string;
    other = (await rows(`insert into public.staff_profiles(organization_id,full_name,basic_salary) values ('${orgA}','Driver',3000) returning id`))[0].id as string;
  });
  const today = async () => (await rows("select (now() at time zone 'Asia/Riyadh')::date::text as d"))[0].d as string;
  it("pay files are for managers; an employee sees only their own", async () => {
    await as("authenticated", staff);
    expect(await rows("select full_name from public.staff_profiles")).toEqual([{ full_name: "Teacher Mona" }]);
    await expect(db.exec(`update public.staff_profiles set basic_salary=99999 where id='${mine}'`)).resolves.toBeDefined();
    await as("authenticated", owner);
    expect((await rows(`select basic_salary from public.staff_profiles where id='${mine}'`))[0].basic_salary).toBe("6000.00");
    await as("authenticated", outsider);
    expect(await rows("select * from public.staff_profiles")).toEqual([]);
  });
  it("employees request their own leave; managers decide and it marks attendance", async () => {
    await as("authenticated", staff);
    await expect(db.exec(`insert into public.leave_requests(organization_id,staff_id,kind,starts_on,ends_on) values ('${orgA}','${other}','annual','2030-01-01','2030-01-02')`)).rejects.toMatchObject({ code: "42501" });
    const leave = (await rows(`insert into public.leave_requests(organization_id,staff_id,kind,starts_on,ends_on,status) values ('${orgA}','${mine}','unpaid','2026-01-05','2026-01-07','approved') returning id,status,days`))[0];
    expect(leave).toMatchObject({ status: "pending", days: 3 });
    await expect(db.exec(`update public.leave_requests set status='approved' where id='${leave.id}'`)).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", owner);
    expect(await rows(`update public.leave_requests set status='approved' where id='${leave.id}' returning decided_by`)).toEqual([{ decided_by: owner }]);
    expect(await rows(`select count(*)::int as n from public.staff_attendance where staff_id='${mine}' and status='leave'`)).toEqual([{ n: 3 }]);
  });
  it("employees check themselves in and out today only", async () => {
    const day = await today();
    await as("authenticated", staff);
    const row = (await rows(`insert into public.staff_attendance(organization_id,staff_id,work_date,status,check_in) values ('${orgA}','${mine}','${day}','absent','2020-01-01T00:00:00Z') returning status,check_in > now() - interval '1 minute' as fresh`))[0];
    expect(row).toEqual({ status: "present", fresh: true });
    await db.exec(`update public.staff_attendance set check_out=now() where staff_id='${mine}'`);
    await expect(db.exec(`update public.staff_attendance set check_out=now() where staff_id='${mine}'`)).rejects.toMatchObject({ code: "23514" });
    await expect(db.exec(`insert into public.staff_attendance(organization_id,staff_id,work_date) values ('${orgA}','${other}','${day}')`)).rejects.toMatchObject({ code: "42501" });
  });
  it("payroll deducts unpaid leave, absences and GOSI, and freezes once approved", async () => {
    await as("authenticated", owner);
    await db.exec(`insert into public.leave_requests(organization_id,staff_id,kind,starts_on,ends_on,status) values ('${orgA}','${mine}','unpaid','2026-01-30','2026-02-02','approved')`);
    await db.exec(`insert into public.staff_attendance(organization_id,staff_id,work_date,status) values ('${orgA}','${other}','2026-01-12','absent')`);
    const run = (await rows(`select public.generate_payroll('${orgA}','2026-01-15') as id`))[0].id as string;
    const lines = await rows(`select full_name,unpaid_days,absence_days,absence_deduction,gosi_deduction,net from public.payroll_lines where run_id='${run}' order by full_name`);
    expect(lines).toEqual([
      { full_name: "Driver", unpaid_days: 0, absence_days: 1, absence_deduction: "100.00", gosi_deduction: "0.00", net: "2900.00" },
      { full_name: "Teacher Mona", unpaid_days: 2, absence_days: 0, absence_deduction: "533.34", gosi_deduction: "731.25", net: "6735.41" },
    ]);
    await db.exec(`update public.payroll_lines set bonus=200 where run_id='${run}' and full_name='Driver'`);
    expect((await rows(`select total_net from public.payroll_runs where id='${run}'`))[0].total_net).toBe("9835.41");
    await db.exec(`update public.payroll_runs set status='approved' where id='${run}'`);
    await expect(db.exec(`update public.payroll_lines set bonus=1 where run_id='${run}'`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`select public.generate_payroll('${orgA}','2026-01-01')`)).rejects.toMatchObject({ code: "23514" });
    await as("authenticated", staff);
    expect(await rows("select * from public.payroll_lines")).toEqual([]);
    await expect(db.exec(`select public.generate_payroll('${orgA}','2026-02-01')`)).rejects.toMatchObject({ code: "42501" });
  });
});

describe("subjects, timetable, grades and behaviour", () => {
  let section: string; let subject: string;
  beforeEach(async () => {
    await db.exec("reset role");
    await db.exec(`delete from public.subjects; delete from public.behavior_notes; delete from public.sections; delete from public.grade_levels;
      insert into public.memberships(organization_id,user_id,role) values ('${orgA}','${staff}','staff') on conflict do nothing`);
    await as("authenticated", owner);
    const grade = (await rows(`insert into public.grade_levels(organization_id,name,sort_order,stage) values ('${orgA}','G1',1,'primary') returning id`))[0].id as string;
    section = (await rows(`insert into public.sections(organization_id,grade_level_id,name) values ('${orgA}','${grade}','A') returning id`))[0].id as string;
    subject = (await rows(`insert into public.subjects(organization_id,name,grade_level_id,weekly_periods) values ('${orgA}','Math','${grade}',5) returning id`))[0].id as string;
  });
  it("managers build the timetable; a teacher cannot be in two classes at once", async () => {
    await as("authenticated", staff);
    await expect(db.exec(`insert into public.timetable_slots(organization_id,section_id,weekday,period,subject_id) values ('${orgA}','${section}',0,1,'${subject}')`)).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", owner);
    const grade = (await rows("select grade_level_id from public.sections limit 1"))[0].grade_level_id as string;
    const section2 = (await rows(`insert into public.sections(organization_id,grade_level_id,name) values ('${orgA}','${grade}','B') returning id`))[0].id as string;
    await db.exec(`insert into public.timetable_slots(organization_id,section_id,weekday,period,subject_id,teacher_id) values ('${orgA}','${section}',0,1,'${subject}','${staff}')`);
    await expect(db.exec(`insert into public.timetable_slots(organization_id,section_id,weekday,period,subject_id,teacher_id) values ('${orgA}','${section2}',0,1,'${subject}','${staff}')`)).rejects.toMatchObject({ code: "23505" });
    await expect(db.exec(`insert into public.timetable_slots(organization_id,section_id,weekday,period,subject_id) values ('${orgA}','${section}',0,1,'${subject}')`)).rejects.toMatchObject({ code: "23505" });
    await expect(db.exec(`insert into public.timetable_slots(organization_id,section_id,weekday,period,subject_id,teacher_id) values ('${orgA}','${section2}',0,2,'${subject}','${outsider}')`)).rejects.toMatchObject({ code: "23503" });
  });
  it("teachers enter grades within the maximum; the grader is stamped", async () => {
    await as("authenticated", staff);
    const assessment = (await rows(`insert into public.assessments(organization_id,section_id,subject_id,title,max_score,weight) values ('${orgA}','${section}','${subject}','Quiz 1',20,10) returning id,created_by`))[0];
    expect(assessment.created_by).toBe(staff);
    expect(await rows(`insert into public.grades(organization_id,assessment_id,child_id,score) values ('${orgA}','${assessment.id}','${childA}',18) returning graded_by`)).toEqual([{ graded_by: staff }]);
    await expect(db.exec(`update public.grades set score=25 where assessment_id='${assessment.id}'`)).rejects.toMatchObject({ code: "23514" });
    await expect(db.exec(`update public.assessments set max_score=10 where id='${assessment.id}'`)).rejects.toMatchObject({ code: "23514" });
    expect(await rows(`update public.grades set absent=true, score=5 where assessment_id='${assessment.id}' returning score`)).toEqual([{ score: null }]);
    await as("authenticated", outsider);
    expect(await rows("select * from public.grades")).toEqual([]);
  });
  it("behaviour points carry the sign of the note", async () => {
    await as("authenticated", staff);
    expect(await rows(`insert into public.behavior_notes(organization_id,child_id,kind,category,points) values ('${orgA}','${childA}','concern','conduct',3) returning points`)).toEqual([{ points: -3 }]);
    expect(await rows(`insert into public.behavior_notes(organization_id,child_id,kind,category,points) values ('${orgA}','${childA}','positive','participation',-2) returning points`)).toEqual([{ points: 2 }]);
  });
});

describe("transport routes and trips", () => {
  let route: string;
  const busParent = "40000000-0000-0000-0000-0000000000d1";
  beforeEach(async () => {
    await db.exec("reset role");
    await db.exec(`delete from public.vehicles; delete from public.bus_routes; delete from private.guardian_portals;
      insert into public.memberships(organization_id,user_id,role) values ('${orgA}','${staff}','staff') on conflict do nothing;
      insert into public.guardians(id,organization_id,full_name) values ('${busParent}','${orgA}','Bus Parent') on conflict do nothing;
      insert into public.child_guardians(organization_id,child_id,guardian_id,relationship) values ('${orgA}','${childA}','${busParent}','father') on conflict do nothing`);
    await as("authenticated", owner);
    const vehicle = (await rows(`insert into public.vehicles(organization_id,name,capacity) values ('${orgA}','Bus 1',14) returning id`))[0].id as string;
    route = (await rows(`insert into public.bus_routes(organization_id,name,vehicle_id) values ('${orgA}','North','${vehicle}') returning id`))[0].id as string;
    await db.exec(`insert into public.route_stops(organization_id,route_id,child_id,stop_name,stop_order) values ('${orgA}','${route}','${childA}','Gate 3',1)`);
  });
  const today = async () => (await rows("select (now() at time zone 'Asia/Riyadh')::date::text as d"))[0].d as string;
  it("managers set up routes; staff run today's trip and mark students on the route only", async () => {
    await as("authenticated", staff);
    await expect(db.exec(`insert into public.bus_routes(organization_id,name) values ('${orgA}','South')`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`insert into public.transport_trips(organization_id,route_id,trip_date,direction) values ('${orgA}','${route}','2020-01-01','to_school')`)).rejects.toMatchObject({ code: "23514" });
    const trip = (await rows(`insert into public.transport_trips(organization_id,route_id,trip_date,direction) values ('${orgA}','${route}','${await today()}','to_school') returning id,started_by`))[0];
    expect(trip.started_by).toBe(staff);
    expect(await rows(`insert into public.trip_events(organization_id,trip_id,child_id,event) values ('${orgA}','${trip.id}','${childA}','boarded') returning recorded_by`)).toEqual([{ recorded_by: staff }]);
    await expect(db.exec(`insert into public.trip_events(organization_id,trip_id,child_id,event) values ('${orgA}','${trip.id}','${childA}','boarded')`)).rejects.toMatchObject({ code: "23505" });
    await db.exec("reset role");
    const stranger = (await rows(`insert into public.children(organization_id,full_name) values ('${orgA}','Walker') returning id`))[0].id as string;
    await as("authenticated", staff);
    await expect(db.exec(`insert into public.trip_events(organization_id,trip_id,child_id,event) values ('${orgA}','${trip.id}','${stranger}','boarded')`)).rejects.toMatchObject({ code: "23514" });
    await db.exec(`update public.transport_trips set finished_at=now() where id='${trip.id}'`);
    await expect(db.exec(`insert into public.trip_events(organization_id,trip_id,child_id,event) values ('${orgA}','${trip.id}','${childA}','dropped')`)).rejects.toMatchObject({ code: "23514" });
    await as("authenticated", outsider);
    expect(await rows("select * from public.trip_events")).toEqual([]);
  });
  it("the family portal shows today's bus events", async () => {
    const trip = (await rows(`insert into public.transport_trips(organization_id,route_id,trip_date,direction) values ('${orgA}','${route}','${await today()}','to_home') returning id`))[0].id as string;
    await db.exec(`insert into public.trip_events(organization_id,trip_id,child_id,event) values ('${orgA}','${trip}','${childA}','dropped')`);
    const token = (await rows(`select public.guardian_portal_token('${busParent}') as t`))[0].t as string;
    await as("anon");
    const portal = (await rows(`select public.family_portal('${token}') as p`))[0].p as { children: { bus: { route: string; event: string }[] }[] };
    expect(portal.children[0].bus).toMatchObject([{ route: "North", event: "dropped" }]);
  });
});

describe("online payments foundation", () => {
  let invoice: { id: string; share_token: string };
  beforeEach(async () => {
    await db.exec("reset role");
    await db.exec(`delete from public.payment_settings; delete from public.payment_intents; delete from public.payments; delete from public.invoice_lines; delete from public.invoices;
      insert into public.memberships(organization_id,user_id,role) values ('${orgA}','${staff}','staff') on conflict do nothing`);
    await as("authenticated", owner);
    invoice = (await rows(`insert into public.invoices(organization_id,child_id,amount_sar,status,title) values ('${orgA}','${childA}',0,'draft','Fees') returning id,share_token`))[0] as { id: string; share_token: string };
    await db.exec(`insert into public.invoice_lines(organization_id,invoice_id,description,kind,quantity,unit_price,vat_rate) values ('${orgA}','${invoice.id}','Tuition','tuition',1,1000,15)`);
    await db.exec(`update public.invoices set status='issued' where id='${invoice.id}'`);
  });
  it("only managers configure payments; sandbox must stay in test mode", async () => {
    await as("authenticated", staff);
    await expect(db.exec(`insert into public.payment_settings(organization_id,provider,is_enabled) values ('${orgA}','sandbox',true)`)).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", owner);
    await expect(db.exec(`insert into public.payment_settings(organization_id,provider,mode,is_enabled) values ('${orgA}','sandbox','live',true)`)).rejects.toMatchObject({ code: "23514" });
    await expect(db.exec(`insert into public.payment_settings(organization_id,provider,methods) values ('${orgA}','moyasar','{bitcoin}')`)).rejects.toMatchObject({ code: "23514" });
  });
  it("families start a payment from the invoice link; sandbox payments never touch the ledger", async () => {
    await as("anon");
    await expect(db.exec(`select public.start_online_payment('${invoice.share_token}','mada')`)).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", owner);
    await db.exec(`insert into public.payment_settings(organization_id,provider,mode,methods,is_enabled) values ('${orgA}','sandbox','test','{mada,apple_pay}',true)`);
    await as("anon");
    const shared = (await rows(`select public.shared_document('${invoice.share_token}') as d`))[0].d as { pay: { provider: string; methods: string[] } };
    expect(shared.pay).toMatchObject({ provider: "sandbox", methods: ["mada", "apple_pay"] });
    await expect(db.exec(`select public.start_online_payment('${invoice.share_token}','tabby')`)).rejects.toMatchObject({ code: "22023" });
    const started = (await rows(`select public.start_online_payment('${invoice.share_token}','mada') as r`))[0].r as { intent: string; amount: number };
    expect(started.amount).toBe(1150);
    expect((await rows(`select public.payment_intent_view('${invoice.share_token}','${started.intent}') as v`))[0].v).toMatchObject({ amount: 1150, status: "initiated" });
    expect((await rows(`select public.payment_intent_view(gen_random_uuid(),'${started.intent}') as v`))[0].v).toBeNull();
    expect((await rows(`select public.finish_sandbox_payment('${invoice.share_token}','${started.intent}',true) as s`))[0].s).toBe("paid");
    await db.exec("reset role");
    expect(await rows("select count(*)::int as n from public.payments")).toEqual([{ n: 0 }]);
    expect((await rows(`select paid_total from public.invoices where id='${invoice.id}'`))[0].paid_total).toBe("0.00");
    await as("anon");
    await expect(db.exec(`select private.settle_online_payment('${started.intent}','x',1150,'SAR',true,true,null,'${"a".repeat(64)}')`)).rejects.toBeDefined();
    await expect(db.exec("select * from public.payment_intents")).rejects.toBeDefined();
  });
  it("a live payment is recorded once, only with the school's own webhook secret, in SAR and live mode", async () => {
    const hash = "b".repeat(64);
    const settle = async (intent: string, amount: number, opts: { currency?: string; live?: boolean; ok?: boolean; hash?: string } = {}) =>
      (await rows(`select private.settle_online_payment('${intent}','pay_${intent.slice(0, 8)}',${amount},'${opts.currency ?? "SAR"}',${opts.live ?? true},${opts.ok ?? true},null,'${opts.hash ?? hash}') as r`))[0].r as string;
    await as("authenticated", staff);
    await expect(db.exec(`select public.set_payment_webhook_secret('${orgA}','moyasar','${hash}')`)).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", owner);
    await db.exec(`insert into public.payment_settings(organization_id,provider,mode,methods,is_enabled) values ('${orgA}','moyasar','live','{mada,tabby}',true)`);
    await db.exec(`select public.set_payment_webhook_secret('${orgA}','moyasar','${hash}')`);
    expect((await rows(`select public.payment_webhook_configured('${orgA}') as p`))[0].p).toEqual(["moyasar"]);
    await as("anon");
    const first = (await rows(`select public.start_online_payment('${invoice.share_token}','mada') as r`))[0].r as { intent: string };
    const started = (await rows(`select public.start_online_payment('${invoice.share_token}','tabby') as r`))[0].r as { intent: string };
    await expect(db.exec(`select public.finish_sandbox_payment('${invoice.share_token}','${started.intent}',true)`)).rejects.toMatchObject({ code: "42501" });
    await db.exec("reset role");
    expect((await rows(`select status from public.payment_intents where id='${first.intent}'`))[0].status).toBe("cancelled");
    expect(await settle(started.intent, 1150, { hash: "c".repeat(64) })).toBe("unauthorized");
    expect(await settle(started.intent, 1150, { live: false })).toBe("needs_review");
    await db.exec(`update public.payment_intents set status='initiated' where id='${started.intent}'`);
    expect(await settle(started.intent, 1150, { currency: "USD" })).toBe("needs_review");
    await db.exec(`update public.payment_intents set status='initiated' where id='${started.intent}'`);
    expect(await settle(started.intent, 999)).toBe("needs_review");
    await db.exec(`update public.payment_intents set status='initiated' where id='${started.intent}'`);
    expect(await rows("select count(*)::int as n from public.payments")).toEqual([{ n: 0 }]);
    expect(await settle(started.intent, 1150)).toBe("recorded");
    expect(await settle(started.intent, 1150)).toBe("already");
    expect(await rows(`select method,amount,reference from public.payments`)).toEqual([{ method: "tabby", amount: "1150.00", reference: `pay_${started.intent.slice(0, 8)}` }]);
    expect((await rows(`select status from public.invoices where id='${invoice.id}'`))[0].status).toBe("paid");
    // The cancelled attempt was paid too (second tab): the money is held for review, never lost or double-booked.
    expect(await settle(first.intent, 1150)).toBe("needs_review");
    expect(await rows("select count(*)::int as n from public.payments")).toEqual([{ n: 1 }]);
    await as("anon");
    expect((await rows(`select public.shared_document('${invoice.share_token}') as d`))[0].d).toMatchObject({ pay: null });
  });
  it("test-mode gateway payments never reach the books", async () => {
    await as("authenticated", owner);
    await db.exec(`insert into public.payment_settings(organization_id,provider,mode,methods,is_enabled) values ('${orgA}','moyasar','test','{mada}',true)`);
    await db.exec(`select public.set_payment_webhook_secret('${orgA}','moyasar','${"d".repeat(64)}')`);
    await as("anon");
    const started = (await rows(`select public.start_online_payment('${invoice.share_token}','mada') as r`))[0].r as { intent: string };
    await db.exec("reset role");
    expect((await rows(`select private.settle_online_payment('${started.intent}','t1',1150,'SAR',false,true,null,'${"d".repeat(64)}') as r`))[0].r).toBe("test");
    expect(await rows("select count(*)::int as n from public.payments")).toEqual([{ n: 0 }]);
    expect((await rows(`select status from public.invoices where id='${invoice.id}'`))[0].status).toBe("issued");
  });
});

describe("automatic messages and pickup confirmation", () => {
  const mum = "40000000-0000-0000-0000-0000000000e1";
  beforeEach(async () => {
    await db.exec("reset role");
    await db.exec(`delete from public.message_outbox; delete from public.message_settings; delete from public.pickups; delete from public.attendance; delete from public.authorized_pickups;
      insert into public.memberships(organization_id,user_id,role) values ('${orgA}','${staff}','staff') on conflict do nothing;
      insert into public.guardians(id,organization_id,full_name,phone,national_id) values ('${mum}','${orgA}','Mum','0500000999','1012345678') on conflict (id) do update set phone='0500000999', national_id='1012345678';
      insert into public.child_guardians(organization_id,child_id,guardian_id,relationship) values ('${orgA}','${childA}','${mum}','mother') on conflict do nothing`);
  });
  const today = async () => (await rows("select (now() at time zone 'Asia/Riyadh')::date::text as d"))[0].d as string;
  it("nothing is queued until the school turns messages on; then absences queue once per guardian", async () => {
    await as("authenticated", staff);
    await db.exec(`insert into public.attendance(organization_id,child_id,attendance_date,status) values ('${orgA}','${childA}','${await today()}','absent')`);
    await db.exec("reset role");
    expect(await rows("select count(*)::int as n from public.message_outbox")).toEqual([{ n: 0 }]);
    await db.exec(`delete from public.attendance; insert into public.message_settings(organization_id) values ('${orgA}')`);
    await as("authenticated", staff);
    await db.exec(`insert into public.attendance(organization_id,child_id,attendance_date,status) values ('${orgA}','${childA}','${await today()}','absent')`);
    await db.exec(`update public.attendance set status='late' where child_id='${childA}'`);
    await db.exec(`update public.attendance set status='absent' where child_id='${childA}'`);
    const queued = await rows(`select kind,to_phone,status from public.message_outbox where to_phone='0500000999' order by created_at`);
    // Each correction cancels the message still waiting; the absence comes back when it is re-marked.
    expect(queued).toEqual([{ kind: "late", to_phone: "0500000999", status: "skipped" }, { kind: "absence", to_phone: "0500000999", status: "queued" }]);
    await db.exec(`update public.attendance set status='present' where child_id='${childA}'`);
    expect(await rows(`select kind,status from public.message_outbox where to_phone='0500000999' order by kind`)).toEqual([{ kind: "absence", status: "skipped" }, { kind: "late", status: "skipped" }]);
    await db.exec(`update public.attendance set status='absent' where child_id='${childA}'`);
    await expect(db.exec(`insert into public.message_outbox(organization_id,to_phone,kind,body) values ('${orgA}','0500000000','custom','hi')`)).rejects.toMatchObject({ code: "42501" });
    const id = (await rows("select id from public.message_outbox limit 1"))[0].id as string;
    await db.exec(`select public.mark_message('${id}','sent')`);
    expect((await rows(`select status,sent_by from public.message_outbox where id='${id}'`))[0]).toEqual({ status: "sent", sent_by: staff });
    await as("authenticated", outsider);
    expect(await rows("select * from public.message_outbox")).toEqual([]);
    await expect(db.exec(`select public.mark_message('${id}','queued')`)).rejects.toMatchObject({ code: "P0002" });
    await as("authenticated", staff);
    await expect(db.exec(`select public.mark_message('${id}','queued')`)).rejects.toMatchObject({ code: "22023" });
  });
  it("staff never see private links; settings for provider, sender and links stay with the platform", async () => {
    await db.exec(`insert into public.message_settings(organization_id) values ('${orgA}')`);
    await as("authenticated", staff);
    await db.exec(`insert into public.pickups(organization_id,child_id,guardian_id) values ('${orgA}','${childA}','${mum}')`);
    expect((await rows("select kind from public.message_outbox order by kind")).map(row => row.kind)).toEqual(["pickup"]);
    await as("authenticated", owner);
    expect((await rows("select kind from public.message_outbox order by kind")).map(row => row.kind)).toEqual(["pickup", "pickup_confirm"]);
    await expect(db.exec(`update public.message_settings set provider='taqnyat' where organization_id='${orgA}'`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`update public.message_settings set site_url='https://evil.example' where organization_id='${orgA}'`)).rejects.toMatchObject({ code: "42501" });
    await db.exec(`update public.message_settings set notify_bus=true where organization_id='${orgA}'`);
    await expect(db.exec(`insert into public.message_outbox(organization_id,to_phone,kind,body) values ('${orgA}','0599999999','custom','spam')`)).rejects.toMatchObject({ code: "42501" });
    await db.exec(`insert into public.message_outbox(organization_id,to_phone,kind,body) values ('${orgA}','0500000999','custom','hello')`);
    await db.exec("reset role");
    expect((await rows("select count(*)::int as n from public.audit_events where entity='message_settings'"))[0].n).toBeGreaterThan(0);
  });
  it("undoing a pickup cancels its waiting messages", async () => {
    await db.exec(`insert into public.message_settings(organization_id) values ('${orgA}')`);
    await as("authenticated", owner);
    const pickup = (await rows(`insert into public.pickups(organization_id,child_id,guardian_id) values ('${orgA}','${childA}','${mum}') returning id`))[0].id as string;
    await db.exec(`delete from public.pickups where id='${pickup}'`);
    expect((await rows("select distinct status from public.message_outbox")).map(row => row.status)).toEqual(["skipped"]);
  });
  it("a pickup sends a confirmation link the receiver confirms with their ID number", async () => {
    await db.exec(`insert into public.message_settings(organization_id) values ('${orgA}')`);
    await as("authenticated", staff);
    const pickup = (await rows(`insert into public.pickups(organization_id,child_id,guardian_id) values ('${orgA}','${childA}','${mum}') returning id`))[0].id as string;
    await db.exec("reset role");
    const link = (await rows(`select body from public.message_outbox where kind='pickup_confirm'`))[0].body as string;
    const token = await linkToken(link, "c");
    await as("anon");
    expect((await rows(`select public.pickup_confirmation_view('${token}') as v`))[0].v).toMatchObject({ child: "Private Child A", picked_by: "Mum", confirmed_at: null });
    expect((await rows(`select public.confirm_pickup('${token}','123') as r`))[0].r).toBe("invalid");
    expect((await rows(`select public.confirm_pickup('${token}','1099999999') as r`))[0].r).toBe("mismatch");
    expect((await rows(`select public.confirm_pickup('${token}','١٠١٢٣٤٥٦٧٨') as r`))[0].r).toBe("confirmed");
    expect((await rows(`select public.confirm_pickup('${token}','1012345678') as r`))[0].r).toBe("already");
    await as("authenticated", staff);
    expect(await rows(`select verified,confirmed_at is not null as done,failed_attempts from public.pickup_confirmations where pickup_id='${pickup}'`)).toEqual([{ verified: true, done: true, failed_attempts: 1 }]);
    await expect(db.exec("select token from public.pickup_confirmations")).rejects.toBeDefined();
    await as("anon");
    expect((await rows("select public.confirm_pickup(gen_random_uuid(),'1012345678') as r"))[0].r).toBe("not_found");
  });
  it("five wrong IDs lock the link", async () => {
    await db.exec(`insert into public.message_settings(organization_id) values ('${orgA}')`);
    await as("authenticated", staff);
    await db.exec(`insert into public.pickups(organization_id,child_id,guardian_id) values ('${orgA}','${childA}','${mum}')`);
    await db.exec("reset role");
    const token = await linkToken((await rows(`select body from public.message_outbox where kind='pickup_confirm'`))[0].body as string, "c");
    await as("anon");
    for (let i = 0; i < 5; i++) await db.exec(`select public.confirm_pickup('${token}','1099999999')`);
    expect((await rows(`select public.confirm_pickup('${token}','1012345678') as r`))[0].r).toBe("locked");
  });
  it("only the server claims messages for a provider", async () => {
    await as("authenticated", owner);
    await expect(db.exec("select * from public.claim_messages(10)")).rejects.toBeDefined();
  });
});

describe("student lifecycle, portal and family messages", () => {
  const dad = "40000000-0000-0000-0000-0000000000e2";
  const kid = "40000000-0000-0000-0000-0000000000c9";
  beforeEach(async () => {
    await db.exec("reset role");
    await db.exec(`delete from public.message_outbox; delete from public.message_settings; delete from public.attendance; delete from public.announcements;
      insert into public.memberships(organization_id,user_id,role) values ('${orgA}','${staff}','staff') on conflict do nothing;
      insert into public.children(id,organization_id,full_name) values ('${kid}','${orgA}','Lifecycle Kid') on conflict (id) do update set status='active';
      insert into public.guardians(id,organization_id,full_name,phone) values ('${dad}','${orgA}','Dad','0500000888') on conflict (id) do nothing;
      insert into public.child_guardians(organization_id,child_id,guardian_id,relationship) values ('${orgA}','${kid}','${dad}','father') on conflict do nothing;
      insert into public.message_settings(organization_id,notify_daily_report) values ('${orgA}',true)`);
  });
  it("a withdrawn student keeps history but gets no new attendance and is not counted", async () => {
    await as("authenticated", owner);
    const before = (await rows(`select coalesce(sum(total),0)::int as n from public.section_enrollment('${orgA}')`))[0].n as number;
    await as("authenticated", staff);
    await expect(db.exec(`update public.children set status='withdrawn' where id='${kid}'`)).resolves.toBeDefined();
    await as("authenticated", owner);
    expect((await rows(`select status from public.children where id='${kid}'`))[0].status).toBe("active");
    await db.exec(`update public.children set status='withdrawn' where id='${kid}'`);
    expect((await rows(`select status_changed_at is not null as stamped from public.children where id='${kid}'`))[0].stamped).toBe(true);
    expect((await rows(`select coalesce(sum(total),0)::int as n from public.section_enrollment('${orgA}')`))[0].n).toBe(before - 1);
    await expect(db.exec(`insert into public.attendance(organization_id,child_id,attendance_date,status) values ('${orgA}','${kid}',(now() at time zone 'Asia/Riyadh')::date,'present')`)).rejects.toMatchObject({ code: "22023" });
    await expect(db.exec(`update public.children set status='expelled' where id='${kid}'`)).rejects.toMatchObject({ code: "23514" });
  });
  it("the portal shows grades, behaviour and status; daily-report messages carry the guardian's portal link", async () => {
    await as("authenticated", owner);
    await db.exec(`insert into public.behavior_notes(organization_id,child_id,kind,category,note) values ('${orgA}','${kid}','positive','participation','Great work')`);
    await db.exec(`insert into public.daily_reports(organization_id,child_id,report_date,mood) values ('${orgA}','${kid}',(now() at time zone 'Asia/Riyadh')::date,'happy')`);
    const body = (await rows(`select body from public.message_outbox where kind='daily_report' and to_phone='0500000888'`))[0].body as string;
    const token = await linkToken(body, "p");
    await as("anon");
    const portal = (await rows(`select public.family_portal('${token}') as p`))[0].p as { guardian: string; children: { status: string; grades: unknown[]; behavior: { note: string }[] }[] };
    expect(portal.guardian).toBe("Dad");
    expect(portal.children[0]).toMatchObject({ status: "active", grades: [], behavior: [{ note: "Great work" }] });
  });
  it("only managers send an announcement to families, once per guardian, with portal links", async () => {
    await as("authenticated", owner);
    const id = (await rows(`insert into public.announcements(organization_id,title,body,audience) values ('${orgA}','Trip','Bring a hat','families') returning id`))[0].id as string;
    await as("authenticated", staff);
    await expect(db.exec(`select public.send_announcement('${id}')`)).rejects.toMatchObject({ code: "P0002" });
    await as("authenticated", owner);
    const sent = (await rows(`select public.send_announcement('${id}') as n`))[0].n as number;
    expect(sent).toBeGreaterThan(0);
    expect((await rows(`select public.send_announcement('${id}') as n`))[0].n).toBe(0);
    const message = (await rows(`select body from public.message_outbox where kind='announcement' and to_phone='0500000888'`))[0].body as string;
    expect(message).toContain("Bring a hat");
    expect(message).toMatch(/\/s\/[A-Za-z0-9]{10}/);
  });
});

describe("staff join links, password resets and short links", () => {
  it("only managers create join links; admins invite staff only", async () => {
    await as("authenticated", staff);
    await expect(db.exec(`select public.create_join_link('${orgA}','staff')`)).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", outsider);
    await expect(db.exec(`select public.create_join_link('${orgA}','staff')`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`select public.create_join_link('${orgB}','admin')`)).rejects.toMatchObject({ code: "42501" });
    expect((await rows(`select public.create_join_link('${orgB}','staff') as c`))[0].c).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });
  it("an employee joins with a username and password, once per link", async () => {
    await as("authenticated", owner);
    const code = (await rows(`select public.create_join_link('${orgA}','staff','Teacher Huda',1) as c`))[0].c as string;
    expect((await rows(`select count(*)::int as n from public.list_join_links('${orgA}')`))[0].n).toBeGreaterThan(0);
    await as("anon");
    expect((await rows(`select public.join_link_view('${code.toLowerCase()}') as v`))[0].v).toMatchObject({ organization: expect.any(String), role: "staff", valid: true });
    await expect(db.exec(`select public.join_with_code('${code}','huda','short')`)).rejects.toMatchObject({ code: "22023" });
    await expect(db.exec(`select public.join_with_code('${code}','x','password1')`)).rejects.toMatchObject({ code: "22023" });
    const email = (await rows(`select public.join_with_code('${code}','Huda.T','secret123') as e`))[0].e;
    expect(email).toBe("huda.t@users.seer.local");
    await expect(db.exec(`select public.join_with_code('${code}','other','secret123')`)).rejects.toMatchObject({ code: "P0002" });
    await db.exec("reset role");
    const user = (await rows(`select id, email_confirmed_at is not null as confirmed, encrypted_password like 'hash:%' as hashed from auth.users where email='huda.t@users.seer.local'`))[0];
    expect(user).toMatchObject({ confirmed: true, hashed: true });
    expect(await rows(`select role, display_name from public.memberships where user_id='${user.id}'`)).toEqual([{ role: "staff", display_name: "Teacher Huda" }]);
    await as("authenticated", owner);
    expect((await rows(`select login from public.member_logins('${orgA}') where user_id='${user.id}'`))[0].login).toBe("huda.t");
    await db.exec(`select public.reset_member_password('${orgA}','${user.id}','newpass99')`);
    await expect(db.exec(`select public.reset_member_password('${orgA}','${owner}','newpass99')`)).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", staff);
    await expect(db.exec(`select public.reset_member_password('${orgA}','${user.id}','newpass99')`)).rejects.toMatchObject({ code: "42501" });
  });
  it("usernames are unique and links can be revoked", async () => {
    await as("authenticated", owner);
    const code = (await rows(`select public.create_join_link('${orgA}','staff',null,5) as c`))[0].c as string;
    await as("anon");
    await expect(db.exec(`select public.join_with_code('${code}','huda.t','secret123')`)).rejects.toMatchObject({ code: "23505" });
    await as("authenticated", owner);
    await db.exec(`select public.revoke_join_link('${orgA}','${code}')`);
    await as("anon");
    expect((await rows(`select public.join_link_view('${code}') as v`))[0].v).toMatchObject({ valid: false });
  });
  it("short links resolve for anyone and messages are shortened as they are queued", async () => {
    const path = "/p/06d4dd6e-3d4b-48dd-a45e-acb72b55cc88";
    await as("anon");
    await expect(db.exec(`select public.short_code('${path}')`)).rejects.toBeDefined();
    await as("authenticated", owner);
    const code = (await rows(`select public.short_code('${path}') as c`))[0].c as string;
    expect(code).toMatch(/^[A-Za-z0-9]{10}$/);
    expect((await rows(`select public.short_code('${path}') as c`))[0].c).toBe(code);
    await expect(db.exec(`select public.short_code('/dashboard/finance')`)).rejects.toMatchObject({ code: "22023" });
    await as("anon");
    expect((await rows(`select public.resolve_short('${code}') as p`))[0].p).toBe(path);
    await db.exec("reset role");
    await db.exec(`insert into public.message_outbox(organization_id,to_phone,kind,body) values ('${orgA}','0500000777','custom','See https://seer.example${path} now')`);
    expect((await rows(`select body from public.message_outbox where to_phone='0500000777'`))[0].body).toBe(`See https://seer.example/s/${code} now`);
  });
});

describe("teaching permissions, notifications and absence notices", () => {
  const kidX = "50000000-0000-0000-0000-0000000000a1", kidY = "50000000-0000-0000-0000-0000000000a2", dad = "50000000-0000-0000-0000-0000000000b1";
  let sectionX = "", sectionY = "";
  const today = async () => (await rows("select (now() at time zone 'Asia/Riyadh')::date::text as d"))[0].d as string;
  beforeAll(async () => {
    await db.exec("reset role");
    const grade = (await rows(`insert into public.grade_levels(organization_id,name,stage,sort_order) values ('${orgA}','G-Teach','primary',50) returning id`))[0].id;
    sectionX = (await rows(`insert into public.sections(organization_id,grade_level_id,name) values ('${orgA}','${grade}','X') returning id`))[0].id as string;
    sectionY = (await rows(`insert into public.sections(organization_id,grade_level_id,name) values ('${orgA}','${grade}','Y') returning id`))[0].id as string;
    await db.exec(`insert into public.children(id,organization_id,full_name,section_id) values ('${kidX}','${orgA}','Kid X','${sectionX}'),('${kidY}','${orgA}','Kid Y','${sectionY}') on conflict do nothing;
      insert into public.memberships(organization_id,user_id,role) values ('${orgA}','${staff}','staff') on conflict do nothing;
      insert into public.guardians(id,organization_id,full_name,phone) values ('${dad}','${orgA}','Dad X','0500000666') on conflict do nothing;
      insert into public.child_guardians(organization_id,child_id,guardian_id,relationship) values ('${orgA}','${kidX}','${dad}','father') on conflict do nothing`);
  });
  it("a teacher assigned to classes records attendance only for them; managers record for all", async () => {
    await db.exec("reset role");
    await db.exec(`update public.sections set homeroom_teacher_id = null where homeroom_teacher_id = '${staff}'; delete from public.timetable_slots where teacher_id = '${staff}'`);
    await as("authenticated", staff);
    // Not assigned anywhere yet: today's open access is kept.
    await db.exec(`insert into public.attendance(organization_id,child_id,attendance_date,status) values ('${orgA}','${kidY}','${await today()}','present')`);
    await db.exec("reset role");
    await db.exec(`delete from public.attendance where child_id in ('${kidX}','${kidY}'); update public.sections set homeroom_teacher_id = '${staff}' where id = '${sectionX}'`);
    await as("authenticated", staff);
    await db.exec(`insert into public.attendance(organization_id,child_id,attendance_date,status) values ('${orgA}','${kidX}','${await today()}','present')`);
    await expect(db.exec(`insert into public.attendance(organization_id,child_id,attendance_date,status) values ('${orgA}','${kidY}','${await today()}','present')`)).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", owner);
    await db.exec(`insert into public.attendance(organization_id,child_id,attendance_date,status) values ('${orgA}','${kidY}','${await today()}','late')`);
    await db.exec("reset role");
    await db.exec(`update public.sections set homeroom_teacher_id = null where id = '${sectionX}'`);
  });
  it("assigning a task notifies the assignee only, and each person reads only their own notifications", async () => {
    await as("authenticated", owner);
    await db.exec(`insert into public.tasks(organization_id,title,assignee_id) values ('${orgA}','Prepare the hall','${staff}')`);
    expect((await rows("select count(*)::int as n from public.notifications where kind='task'"))[0].n).toBe(0);
    await as("authenticated", staff);
    const mine = await rows("select id,kind,title,url from public.notifications where title like '%Prepare the hall%'");
    expect(mine).toEqual([expect.objectContaining({ kind: "task", url: "/dashboard/my" })]);
    await db.exec(`update public.notifications set read_at = now() where id = '${mine[0].id}'`);
    await expect(db.exec(`update public.notifications set title = 'x' where id = '${mine[0].id}'`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`insert into public.notifications(organization_id,user_id,kind,title) values ('${orgA}','${staff}','task','fake')`)).rejects.toBeDefined();
  });
  it("parents send an absence notice from the portal; managers are notified", async () => {
    await as("authenticated", owner);
    const token = (await rows(`select public.guardian_portal_token('${dad}') as t`))[0].t as string;
    await as("anon");
    const portal = (await rows(`select public.family_portal('${token}') as p`))[0].p as { children: { id: string; name: string }[] };
    expect(portal.children[0]).toMatchObject({ id: kidX, name: "Kid X" });
    await expect(db.exec(`select public.submit_absence_notice('${token}','${kidY}','${await today()}','${await today()}','sick')`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`select public.submit_absence_notice('${token}','${kidX}','2020-01-01','2020-01-02','sick')`)).rejects.toMatchObject({ code: "22023" });
    await db.exec(`select public.submit_absence_notice('${token}','${kidX}','${await today()}','${await today()}','Fever')`);
    await as("authenticated", staff);
    expect(await rows(`select reason from public.absence_notices where child_id='${kidX}'`)).toEqual([{ reason: "Fever" }]);
    await as("authenticated", owner);
    expect((await rows("select title from public.notifications where kind='absence_notice'"))[0].title).toContain("Kid X");
    await as("anon");
    expect(((await rows(`select public.family_portal('${token}') as p`))[0].p as { children: { notices: unknown[] }[] }).children[0].notices).toHaveLength(1);
  });
});

describe("push keys and one-time push jobs", () => {
  it("keys are stored once with a bootstrap token; jobs are claimed once; notifications survive without push", async () => {
    await db.exec("reset role");
    await db.exec("insert into private.push_bootstrap(token) values ('bootstrap-token-0123456789abcdefghij')");
    await as("anon");
    await expect(db.exec("select public.init_push_keys('wrong-token-0123456789abcdefghijklmn','" + "P".repeat(80) + "','" + "K".repeat(40) + "')")).rejects.toMatchObject({ code: "42501" });
    expect((await rows("select public.init_push_keys('bootstrap-token-0123456789abcdefghij','" + "P".repeat(80) + "','" + "K".repeat(40) + "') as ok"))[0].ok).toBe(true);
    expect((await rows("select public.init_push_keys('bootstrap-token-0123456789abcdefghij','x','y') as ok"))[0].ok).toBe(false);
    await expect(db.exec("select public.push_public_key()")).rejects.toBeDefined();
    await as("authenticated", staff);
    expect((await rows("select public.push_public_key() as k"))[0].k).toBe("P".repeat(80));
    await expect(db.exec("select * from private.push_keys")).rejects.toBeDefined();
    await db.exec("reset role");
    await db.exec(`insert into private.push_jobs(nonce,payload) values ('job-1','{"title":"Hi","subscriptions":[]}')`);
    await as("anon");
    expect((await rows("select public.claim_push_job('job-1') as j"))[0].j).toMatchObject({ title: "Hi", public_key: "P".repeat(80) });
    expect((await rows("select public.claim_push_job('job-1') as j"))[0].j).toBeNull();
    await as("authenticated", owner);
    await db.exec(`insert into public.tasks(organization_id,title,assignee_id) values ('${orgA}','Push check','${staff}')`);
    await as("authenticated", staff);
    expect((await rows("select count(*)::int as n from public.notifications where title like '%Push check%'"))[0].n).toBe(1);
  });
});

describe("system health: error log, checks and repairs", () => {
  it("records errors once per kind with private details masked, and reopens a resolved error that recurs", async () => {
    await as("anon");
    const route = "/p/06d4dd6e-3d4b-48dd-a45e-acb72b55cc88?x=1";
    await db.exec(`select public.log_error('client','Cannot read id 06d4dd6e-3d4b-48dd-a45e-acb72b55cc88 for sara@example.com phone 0501234567','${route}')`);
    await db.exec(`select public.log_error('client','Cannot read id 11111111-3d4b-48dd-a45e-acb72b55cc88 for ali@example.com phone 0559999999','/p/22222222-3d4b-48dd-a45e-acb72b55cc88')`);
    await db.exec("reset role");
    const rowsNow = await rows("select fingerprint,message,route,count,status from public.system_errors where kind='client'");
    expect(rowsNow).toHaveLength(1);
    expect(rowsNow[0]).toMatchObject({ message: "Cannot read id :id for :email phone #", route: "/p/:id", count: 2, status: "new" });
    await db.exec(`insert into private.platform_admins(user_id) values ('${owner}') on conflict do nothing`);
    await as("authenticated", staff);
    expect(await rows("select * from public.system_errors")).toEqual([]);
    await as("authenticated", owner);
    await db.exec(`update public.system_errors set status='resolved', resolution='حدّث الصفحة' where fingerprint='${rowsNow[0].fingerprint}'`);
    await as("anon");
    expect((await rows(`select public.log_error('client','Cannot read id 06d4dd6e-3d4b-48dd-a45e-acb72b55cc88 for a@b.co phone 0501234567','${route}') as fix`))[0].fix).toBe("حدّث الصفحة");
    await db.exec("reset role");
    expect((await rows(`select status,regressed from public.system_errors where fingerprint='${rowsNow[0].fingerprint}'`))[0]).toEqual({ status: "new", regressed: true });
  });
  it("managers run checks and safe repairs; staff cannot", async () => {
    await db.exec("reset role");
    await db.exec(`insert into public.message_outbox(organization_id,to_phone,kind,body,status,claimed_at) values ('${orgA}','0500000123','custom','stuck','sending',now() - interval '1 hour')`);
    await as("authenticated", staff);
    await expect(db.exec(`select public.system_health('${orgA}')`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`select public.system_repair('${orgA}','messages_stuck')`)).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", owner);
    const checks = (await rows(`select public.system_health('${orgA}') as h`))[0].h as { id: string; count: number; fixable: boolean }[];
    expect(checks.find(item => item.id === "messages_stuck")).toMatchObject({ fixable: true });
    expect(checks.find(item => item.id === "messages_stuck")!.count).toBeGreaterThan(0);
    expect((await rows(`select public.system_repair('${orgA}','messages_stuck') as n`))[0].n).toBeGreaterThan(0);
    await expect(db.exec(`select public.system_repair('${orgA}','children_no_section')`)).rejects.toMatchObject({ code: "22023" });
    expect((await rows(`select check_id from public.list_repairs('${orgA}')`))[0].check_id).toBe("messages_stuck");
    await db.exec("reset role");
    expect((await rows("select private.self_heal() as n"))[0].n).toBeGreaterThanOrEqual(0);
  });
});

describe("subscriptions: access, billing, plans and the platform console", () => {
  const platformAdmin = "60000000-0000-0000-0000-0000000000ad";
  const signer = "60000000-0000-0000-0000-0000000000a5";
  const today = async () => (await rows("select (now() at time zone 'Asia/Riyadh')::date::text as d"))[0].d as string;
  const setEnds = async (days: number, status = "active") => {
    await db.exec("reset role");
    await db.exec(`update public.subscriptions set status='${status}', ends_on = ((now() at time zone 'Asia/Riyadh')::date + ${days}), starts_on = least(starts_on, (now() at time zone 'Asia/Riyadh')::date + ${days}) where organization_id='${orgA}'`);
  };
  const plan = async (key: string) => (await rows(`select id from public.plans where key='${key}'`))[0].id as string;
  beforeAll(async () => {
    await db.exec("reset role");
    await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${platformAdmin}','admin@seer.test',now()),('${signer}','new.owner@school.test',now()) on conflict do nothing;
      delete from private.platform_admins; insert into private.platform_admins(user_id) values ('${platformAdmin}');
      insert into public.memberships(organization_id,user_id,role) values ('${orgA}','${staff}','staff') on conflict do nothing`);
  });
  afterAll(async () => { await setEnds(365); });

  it("every organization has a subscription; new ones start a trial with every section", async () => {
    await db.exec("reset role");
    expect((await rows(`select count(*)::int as n from public.organizations o where not exists (select 1 from public.subscriptions s where s.organization_id = o.id)`))[0].n).toBe(0);
    const org = (await rows("insert into public.organizations(name,type) values ('Trial School','school') returning id"))[0].id as string;
    expect(await rows(`select status, ends_on - (now() at time zone 'Asia/Riyadh')::date as days from public.subscriptions where organization_id='${org}'`)).toEqual([{ status: "trial", days: 14 }]);
    expect((await rows(`select private.org_has_feature('${org}','transport') as f`))[0].f).toBe(true);
  });
  it("grace keeps the school working; after the grace days everything closes except billing", async () => {
    await setEnds(-3);
    expect((await rows(`select private.org_access('${orgA}') as a`))[0].a).toBe("grace");
    await as("authenticated", staff);
    expect((await rows(`select count(*)::int as n from public.children where organization_id='${orgA}'`))[0].n).toBeGreaterThan(0);
    await setEnds(-8);
    expect((await rows(`select private.org_access('${orgA}') as a`))[0].a).toBe("locked");
    await as("authenticated", staff);
    expect(await rows(`select id from public.children where organization_id='${orgA}'`)).toEqual([]);
    await expect(db.exec(`insert into public.tasks(organization_id,title) values ('${orgA}','x')`)).rejects.toBeDefined();
    expect((await rows(`select count(*)::int as n from public.memberships where user_id='${staff}'`))[0].n).toBeGreaterThan(0);
    expect((await rows(`select public.billing_overview('${orgA}') as b`))[0].b).toMatchObject({ access: "locked", owner: false, payments: [] });
    await as("authenticated", owner);
    expect(await rows(`select id from public.children where organization_id='${orgA}'`)).toEqual([]);
    expect((await rows(`select public.billing_overview('${orgA}') as b`))[0].b).toMatchObject({ access: "locked", owner: true });
    expect((await rows(`select access from public.my_organizations() where organization_id='${orgA}'`))[0].access).toBe("locked");
    await as("authenticated", platformAdmin);
    expect((await rows(`select access from public.admin_subscribers(null,'locked') where organization_id='${orgA}'`))).toHaveLength(1);
    // Family links pause while locked (platform setting on by default).
    await as("authenticated", owner);
    await setEnds(30);
    await as("authenticated", owner);
    const portalToken = (await rows(`select public.guardian_portal_token((select id from public.guardians where organization_id='${orgA}' limit 1)) as t`))[0].t as string;
    await setEnds(-8);
    await as("anon");
    expect((await rows(`select public.family_portal('${portalToken}') as p`))[0].p).toBeNull();
    await setEnds(30);
    await as("anon");
    expect((await rows(`select public.family_portal('${portalToken}') as p`))[0].p).not.toBeNull();
  });
  it("the owner pays by transfer: amount from the server, receipt only in their own folder", async () => {
    await setEnds(-8);
    const advanced = await plan("advanced");
    await as("authenticated", owner);
    await db.exec(`insert into storage.objects(bucket_id,name) values ('subscription-receipts','${orgA}/receipt-1.jpg')`);
    await expect(db.exec(`insert into storage.objects(bucket_id,name) values ('subscription-receipts','${orgB}/receipt-x.jpg')`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`select public.submit_subscription_payment('${orgA}','${advanced}',12,'TRX-1','${orgB}/receipt-x.jpg')`)).rejects.toMatchObject({ code: "22023" });
    const id = (await rows(`select public.submit_subscription_payment('${orgA}','${advanced}',12,'TRX-1','${orgA}/receipt-1.jpg') as id`))[0].id as string;
    expect((await rows(`select amount from public.subscription_payments where id='${id}'`))[0].amount).toBe("4790.40");
    expect((await rows(`select public.quote_subscription('${advanced}',3) as a`))[0].a).toBe("1422.15");
    await as("authenticated", staff);
    await expect(db.exec(`select public.submit_subscription_payment('${orgA}','${advanced}',1,'TRX-2','${orgA}/receipt-2.jpg')`)).rejects.toMatchObject({ code: "42501" });
    expect(await rows(`select id from public.subscription_payments where organization_id='${orgA}'`)).toEqual([]);
    await as("authenticated", outsider);
    expect(await rows(`select name from storage.objects where bucket_id='subscription-receipts'`)).toEqual([]);
    await as("authenticated", platformAdmin);
    expect((await rows(`select name from storage.objects where bucket_id='subscription-receipts'`)).map(r => r.name)).toContain(`${orgA}/receipt-1.jpg`);
    await as("authenticated", owner);
    await expect(db.exec(`select public.admin_approve_payment('${id}')`)).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", staff);
    await expect(db.exec(`select public.admin_approve_payment('${id}')`)).rejects.toMatchObject({ code: "42501" });
    // Expired: the paid period starts today.
    await as("authenticated", platformAdmin);
    const end = (await rows(`select public.admin_approve_payment('${id}')::text as d`))[0].d as string;
    expect(end).toBe((await rows("select ((now() at time zone 'Asia/Riyadh')::date + interval '12 months')::date::text as d"))[0].d);
    expect((await rows(`select private.org_access('${orgA}') as a`))[0].a).toBe("active");
    await expect(db.exec(`select public.admin_approve_payment('${id}')`)).rejects.toMatchObject({ code: "22023" });
    await db.exec("reset role");
    expect((await rows(`select count(*)::int as n from public.audit_events where organization_id='${orgA}' and entity in ('subscriptions','subscription_payments')`))[0].n).toBeGreaterThanOrEqual(2);
    expect((await rows(`select count(*)::int as n from public.notifications where user_id='${owner}' and kind='subscription'`))[0].n).toBeGreaterThan(0);
  });
  it("a running subscription is extended from its end date; rejection needs a reason", async () => {
    await setEnds(10);
    const basic = await plan("basic");
    const before = (await rows(`select ends_on::text as d from public.subscriptions where organization_id='${orgA}'`))[0].d as string;
    await as("authenticated", owner);
    const id = (await rows(`select public.submit_subscription_payment('${orgA}','${basic}',3,'TRX-3','${orgA}/receipt-3.jpg') as id`))[0].id as string;
    const other = (await rows(`select public.submit_subscription_payment('${orgA}','${basic}',1,'TRX-4','${orgA}/receipt-4.jpg') as id`))[0].id as string;
    await as("authenticated", platformAdmin);
    expect((await rows(`select public.admin_approve_payment('${id}')::text as d`))[0].d).toBe((await rows(`select ('${before}'::date + interval '3 months')::date::text as d`))[0].d);
    await expect(db.exec(`select public.admin_reject_payment('${other}','')`)).rejects.toMatchObject({ code: "22023" });
    await db.exec(`select public.admin_reject_payment('${other}','المبلغ المحوّل ناقص')`);
    await as("authenticated", owner);
    expect((await rows(`select status, reject_reason from public.subscription_payments where id='${other}'`))[0]).toEqual({ status: "rejected", reject_reason: "المبلغ المحوّل ناقص" });
  });
  it("sections outside the plan or turned off cannot be written", async () => {
    await setEnds(30);
    await as("authenticated", platformAdmin);
    await db.exec(`select public.admin_set_plan('${orgA}','${await plan("basic")}')`);
    await as("authenticated", owner);
    await expect(db.exec(`insert into public.vehicles(organization_id,name) values ('${orgA}','Bus 9')`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`insert into public.subjects(organization_id,name) values ('${orgA}','Math 9')`)).rejects.toMatchObject({ code: "42501" });
    expect((await rows(`select public.org_has_feature('${orgA}','transport') as f`))[0].f).toBe(false);
    await as("authenticated", platformAdmin);
    await db.exec(`select public.admin_set_plan('${orgA}','${await plan("advanced")}')`);
    await as("authenticated", owner);
    await db.exec(`insert into public.vehicles(organization_id,name) values ('${orgA}','Bus 9')`);
    await db.exec(`select public.save_org_settings('${orgA}', array['transport'], '#225588', null)`);
    await expect(db.exec(`insert into public.vehicles(organization_id,name) values ('${orgA}','Bus 10')`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`select public.save_org_settings('${orgA}', array['rockets'], null, null)`)).rejects.toMatchObject({ code: "22023" });
    await as("authenticated", staff);
    await expect(db.exec(`select public.save_org_settings('${orgA}', '{}', null, null)`)).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", owner);
    await db.exec(`select public.save_org_settings('${orgA}', '{}', null, null)`);
  });
  it("one trial per email and per phone; the account is created only after email verification", async () => {
    await as("anon");
    await expect(db.exec("select public.start_signup('bad','0501112233','Huda','Rose','nursery')")).rejects.toMatchObject({ code: "22023" });
    await db.exec("select public.start_signup('New.Owner@school.test','٠٥٠١١١٢٢٣٣','هدى','روضة الورد','nursery')");
    await db.exec("reset role");
    await db.exec(`update auth.users set email_confirmed_at = null where id='${signer}'`);
    await as("authenticated", signer);
    await expect(db.exec("select public.complete_signup()")).rejects.toMatchObject({ code: "42501" });
    await db.exec("reset role");
    await db.exec(`update auth.users set email_confirmed_at = now() where id='${signer}'`);
    await as("authenticated", signer);
    const org = (await rows("select public.complete_signup() as o"))[0].o as string;
    expect(await rows(`select role, display_name from public.memberships where organization_id='${org}' and user_id='${signer}'`)).toEqual([{ role: "owner", display_name: "هدى" }]);
    expect((await rows(`select status from public.subscriptions where organization_id='${org}'`))[0].status).toBe("trial");
    expect((await rows("select public.complete_signup() as o"))[0].o).toBeNull();
    await as("anon");
    await expect(db.exec("select public.start_signup('new.owner@school.test','0509998877','هدى','روضة ثانية','nursery')")).rejects.toMatchObject({ code: "23505" });
    await expect(db.exec("select public.start_signup('other@school.test','0501112233','هدى','روضة ثالثة','nursery')")).rejects.toMatchObject({ code: "23505" });
    await db.exec("reset role");
    expect((await rows(`select count(*)::int as n from public.notifications where user_id='${platformAdmin}' and kind='signup'`))[0].n).toBe(1);
  });
  it("only the platform admin sees the console, changes plans and settings; changes are audited", async () => {
    await as("authenticated", owner);
    await expect(db.exec("select public.admin_overview()")).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec("select public.admin_save_settings('[]', 14, 7, true)")).rejects.toMatchObject({ code: "42501" });
    expect((await rows("select public.am_platform_admin() as a"))[0].a).toBe(false);
    await as("authenticated", platformAdmin);
    expect((await rows("select public.am_platform_admin() as a"))[0].a).toBe(true);
    expect((await rows("select public.admin_overview() as o"))[0].o).toMatchObject({ pending: 0 });
    await expect(db.exec(`select public.admin_save_settings('[{"bank":"الراجحي","holder":"سير","iban":"SA123"}]', 14, 7, true)`)).rejects.toMatchObject({ code: "22023" });
    await db.exec(`select public.admin_save_settings('[{"bank":"الراجحي","holder":"شركة سير","iban":"SA0380000000608010167519"}]', 10, 5, false)`);
    const advanced = await plan("advanced");
    await db.exec(`select public.admin_save_plan('${advanced}','advanced','المتقدمة','وصف', private.feature_keys(), 549, 2, true)`);
    await db.exec(`select public.admin_save_duration(12, 25, true)`);
    const extended = (await rows(`select public.admin_extend('${orgA}', 30) as d`))[0].d;
    expect(extended).toBeTruthy();
    await db.exec(`select public.admin_set_note('${orgA}','عميل مهم')`);
    await db.exec(`select public.admin_set_suspended('${orgA}', true)`);
    expect((await rows(`select private.org_access('${orgA}') as a`))[0].a).toBe("locked");
    await db.exec(`select public.admin_set_suspended('${orgA}', false)`);
    expect((await rows(`select private.org_access('${orgA}') as a`))[0].a).toBe("active");
    expect((await rows("select count(*)::int as n from public.admin_audit()"))[0].n).toBeGreaterThanOrEqual(3);
    expect((await rows(`select public.admin_subscriber('${orgA}') as s`))[0].s).toMatchObject({ access: "active" });
    expect((await rows(`select public.quote_subscription('${advanced}',12) as a`))[0].a).toBe("4941.00");
    await as("anon");
    expect(((await rows("select public.pricing() as p"))[0].p as { plans: unknown[]; trial_days: number })).toMatchObject({ trial_days: 10 });
    await as("authenticated", platformAdmin);
    await db.exec(`select public.admin_save_settings('[]', 14, 7, true)`);
  });
  it("daily job sends each reminder once and syncs the status", async () => {
    await setEnds(3);
    await db.exec("reset role");
    expect((await rows("select private.subscription_daily() as n"))[0].n).toBeGreaterThanOrEqual(1);
    expect((await rows("select private.subscription_daily() as n"))[0].n).toBe(0);
    expect((await rows(`select count(*)::int as n from private.subscription_reminders where organization_id='${orgA}' and kind='d3'`))[0].n).toBe(1);
    await setEnds(-2);
    await db.exec("select private.subscription_daily()");
    expect((await rows(`select status from public.subscriptions where organization_id='${orgA}'`))[0].status).toBe("grace");
    await setEnds(365);
  });
});

describe("pilot launch: owner consent and extending by months", () => {
  const platformAdmin = "60000000-0000-0000-0000-0000000000ad";
  it("only the owner accepts, once per version; each person reads only their own acceptances", async () => {
    await as("authenticated", staff);
    await expect(db.exec(`select public.accept_legal('${orgA}','2026-11-11')`)).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", outsider);
    await expect(db.exec(`select public.accept_legal('${orgA}','2026-11-11')`)).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", owner);
    await expect(db.exec(`select public.accept_legal('${orgA}','bad version!')`)).rejects.toMatchObject({ code: "22023" });
    expect((await rows(`select legal_version from public.my_organizations() where organization_id='${orgA}'`))[0].legal_version).toBeNull();
    await db.exec(`select public.accept_legal('${orgA}','2026-11-11')`);
    await db.exec(`select public.accept_legal('${orgA}','2026-11-11')`);
    expect((await rows(`select count(*)::int as n from public.legal_acceptances where organization_id='${orgA}'`))[0].n).toBe(1);
    expect((await rows(`select legal_version from public.my_organizations() where organization_id='${orgA}'`))[0].legal_version).toBe("2026-11-11");
    // A new version is asked again; the latest acceptance is the one returned.
    await db.exec(`select public.accept_legal('${orgA}','2027-01-01')`);
    expect((await rows(`select legal_version from public.my_organizations() where organization_id='${orgA}'`))[0].legal_version).toBe("2027-01-01");
    // No direct writes, even by the owner.
    await expect(db.exec(`insert into public.legal_acceptances(organization_id,user_id,version) values ('${orgA}','${owner}','x')`)).rejects.toBeDefined();
    await expect(db.exec(`delete from public.legal_acceptances where organization_id='${orgA}'`)).rejects.toBeDefined();
    await as("authenticated", staff);
    expect(await rows("select id from public.legal_acceptances")).toEqual([]);
  });
  it("my_organizations returns the display name", async () => {
    await db.exec("reset role");
    await db.exec(`update public.memberships set display_name='أبو فهد' where organization_id='${orgA}' and user_id='${owner}'`);
    await as("authenticated", owner);
    expect((await rows(`select display_name from public.my_organizations() where organization_id='${orgA}'`))[0].display_name).toBe("أبو فهد");
  });
  it("the platform admin extends by calendar months; nobody else can", async () => {
    await db.exec("reset role");
    await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${platformAdmin}','admin@seer.test',now()) on conflict do nothing;
      insert into private.platform_admins(user_id) values ('${platformAdmin}') on conflict do nothing;
      update public.subscriptions set status='active', starts_on=(now() at time zone 'Asia/Riyadh')::date - 10, ends_on=(now() at time zone 'Asia/Riyadh')::date - 3 where organization_id='${orgA}'`);
    await as("authenticated", owner);
    await expect(db.exec(`select public.admin_extend_months('${orgA}', 3)`)).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", platformAdmin);
    await expect(db.exec(`select public.admin_extend_months('${orgA}', 0)`)).rejects.toMatchObject({ code: "22023" });
    const expected = (await rows("select (((now() at time zone 'Asia/Riyadh')::date + interval '3 months')::date)::text as d"))[0].d;
    expect((await rows(`select public.admin_extend_months('${orgA}', 3)::text as d`))[0].d).toBe(expected);
    expect((await rows(`select private.org_access('${orgA}') as a`))[0].a).toBe("active");
    await db.exec("reset role");
    await db.exec(`update public.subscriptions set ends_on=(now() at time zone 'Asia/Riyadh')::date + 365 where organization_id='${orgA}'`);
  });
});

describe("in-app support tickets", () => {
  const platformAdmin = "60000000-0000-0000-0000-0000000000ad";
  let thread = "";
  const open = (subject = "مشكلة في الحضور", page = "/dashboard/attendance?org=x&child=y") =>
    `select public.open_support_thread('${orgA}','${subject}','ما يحفظ الحضور','${page}', array['كيف أسجل الحضور؟','وين الفصول'])::text as id`;
  beforeAll(async () => {
    await db.exec("reset role");
    await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${platformAdmin}','admin@seer.test',now()) on conflict do nothing;
      insert into private.platform_admins(user_id) values ('${platformAdmin}') on conflict do nothing;
      delete from public.notifications where kind = 'support'`);
  });
  it("a member opens a thread tied to their organization; the page keeps only its path; admins are notified", async () => {
    await as("authenticated", outsider);
    await expect(db.exec(open())).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", staff);
    thread = (await rows(open()))[0].id as string;
    const [row] = await rows(`select organization_id::text as org, page, assistant_questions as q, status from public.support_threads where id='${thread}'`);
    expect(row).toEqual({ org: orgA, page: "/dashboard/attendance", q: ["كيف أسجل الحضور؟", "وين الفصول"], status: "open" });
    await db.exec("reset role");
    const name = (await rows(`select name from public.organizations where id='${orgA}'`))[0].name as string;
    expect(await rows(`select title, url from public.notifications where user_id='${platformAdmin}' and kind='support'`)).toEqual([{ title: `تذكرة دعم جديدة: ${name}`, url: `/admin/support/${thread}` }]);
  });
  it("a user sees only their own threads; the platform admin sees all; nobody writes directly", async () => {
    await as("authenticated", owner);
    expect(await rows("select id from public.support_threads")).toEqual([]);
    expect(await rows("select id from public.support_messages")).toEqual([]);
    await expect(db.exec(`select public.reply_support('${thread}','تدخل')`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`insert into public.support_threads(organization_id,user_id,subject) values ('${orgA}','${owner}','x y')`)).rejects.toBeDefined();
    await as("authenticated", staff);
    expect((await rows("select count(*)::int as n from public.support_messages"))[0].n).toBe(1);
    await expect(db.exec(`update public.support_threads set status='closed' where id='${thread}'`)).rejects.toBeDefined();
    await as("authenticated", platformAdmin);
    expect((await rows(`select count(*)::int as n from public.support_threads where id='${thread}'`))[0].n).toBe(1);
    const list = await rows("select subject, status, organization, last_sender from public.admin_support_threads()");
    expect(list[0]).toMatchObject({ subject: "مشكلة في الحضور", status: "open", last_sender: "user" });
    expect(await rows(`select id::text as id from public.admin_support_threads('${thread}')`)).toEqual([{ id: thread }]);
    await as("authenticated", staff);
    await expect(db.exec("select * from public.admin_support_threads()")).rejects.toMatchObject({ code: "42501" });
  });
  it("replies notify the other side; closing stops replies", async () => {
    await as("authenticated", platformAdmin);
    await db.exec(`select public.reply_support('${thread}','جرّب تحديث الصفحة')`);
    await db.exec("reset role");
    expect(await rows(`select title from public.notifications where user_id='${staff}' and kind='support'`)).toEqual([{ title: "رد من فريق سِير" }]);
    expect((await rows(`select from_admin from public.support_messages where thread_id='${thread}' order by created_at desc limit 1`))[0].from_admin).toBe(true);
    await as("authenticated", staff);
    await db.exec(`select public.reply_support('${thread}','اشتغل، شكرًا')`);
    await db.exec("reset role");
    expect((await rows(`select count(*)::int as n from public.notifications where user_id='${platformAdmin}' and kind='support'`))[0].n).toBe(2);
    await as("authenticated", platformAdmin);
    await db.exec(`select public.close_support_thread('${thread}')`);
    await as("authenticated", staff);
    await expect(db.exec(`select public.reply_support('${thread}','سؤال ثاني')`)).rejects.toMatchObject({ code: "22023" });
  });
  it("limits open threads per user and rejects empty problems", async () => {
    await as("authenticated", staff);
    await expect(db.exec(`select public.open_support_thread('${orgA}','','  ')`)).rejects.toMatchObject({ code: "22023" });
    for (let i = 0; i < 3; i++) await db.exec(open(`تذكرة ${i}`, "/dashboard"));
    await expect(db.exec(open("الرابعة", "/dashboard"))).rejects.toMatchObject({ code: "54000" });
    await db.exec("reset role");
    await db.exec(`delete from public.support_threads where user_id='${staff}'`);
  });
});

describe("organization invite links (no email)", () => {
  const platformAdmin = "60000000-0000-0000-0000-0000000000ad";
  const invite = (name = "مدرسة النخبة", months = 3, plan = "null") => `select public.admin_create_org_invite('${name}','school',${plan},${months},'تجربة الرياض') as t`;
  beforeAll(async () => {
    await db.exec("reset role");
    await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${platformAdmin}','admin@seer.test',now()) on conflict do nothing;
      insert into private.platform_admins(user_id) values ('${platformAdmin}') on conflict do nothing;
      delete from private.org_invite_attempts`);
  });
  it("only the platform admin creates invites; only the hash of the token is stored", async () => {
    for (const who of [owner, staff, outsider]) {
      await as("authenticated", who);
      await expect(db.exec(invite())).rejects.toMatchObject({ code: "42501" });
    }
    await as("anon");
    await expect(db.exec(invite())).rejects.toBeDefined();
    await as("authenticated", platformAdmin);
    await expect(db.exec(invite("مدرسة", 13))).rejects.toMatchObject({ code: "22023" });
    const token = (await rows(invite()))[0].t as string;
    expect(token).toMatch(/^[A-HJ-NP-Za-km-z2-9]{32}$/);
    await db.exec("reset role");
    const stored = await rows("select token_hash, org_name, trial_months from private.org_invites order by created_at desc limit 1");
    expect(stored[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored[0].token_hash).not.toContain(token);
    expect(JSON.stringify(await rows("select * from private.org_invites"))).not.toContain(token);
    expect((await rows("select count(*)::int as n from private.platform_audit where action = 'org_invite_created'"))[0].n).toBeGreaterThan(0);
  });
  it("creates the organization, its owner, the subscription and the legal acceptance in one go; the link works once", async () => {
    await as("authenticated", platformAdmin);
    const token = (await rows(invite("روضة الأمل", 3)))[0].t as string;
    await as("anon");
    expect((await rows(`select public.org_invite_view('${token}') as v`))[0].v).toMatchObject({ valid: true, organization: "روضة الأمل", trial_months: 3 });
    // A bad password or a missing consent changes nothing and keeps the link usable.
    await expect(db.exec(`select public.accept_org_invite('${token}','owner.amal','short','أم فهد','2026-11-11')`)).rejects.toMatchObject({ code: "22023" });
    await expect(db.exec(`select public.accept_org_invite('${token}','owner.amal','secret123','أم فهد',null)`)).rejects.toMatchObject({ code: "22023" });
    const result = (await rows(`select public.accept_org_invite('${token}','owner.amal','secret123','أم فهد','2026-11-11') as r`))[0].r as { ok: boolean; login: string; organization_id: string };
    expect(result).toMatchObject({ ok: true, login: "owner.amal@users.seer.local" });
    const org = result.organization_id;
    await db.exec("reset role");
    expect(await rows(`select name, type from public.organizations where id='${org}'`)).toEqual([{ name: "روضة الأمل", type: "school" }]);
    const [member] = await rows(`select m.role, m.display_name, u.email, u.email_confirmed_at is not null as confirmed from public.memberships m join auth.users u on u.id = m.user_id where m.organization_id='${org}'`);
    expect(member).toEqual({ role: "owner", display_name: "أم فهد", email: "owner.amal@users.seer.local", confirmed: true });
    const expected = (await rows("select (((now() at time zone 'Asia/Riyadh')::date + interval '3 months')::date)::text as d"))[0].d;
    expect(await rows(`select s.status, s.ends_on::text as ends, p.key from public.subscriptions s join public.plans p on p.id = s.plan_id where s.organization_id='${org}'`)).toEqual([{ status: "trial", ends: expected, key: "advanced" }]);
    expect(await rows(`select version from public.legal_acceptances where organization_id='${org}'`)).toEqual([{ version: "2026-11-11" }]);
    expect((await rows(`select count(*)::int as n from public.audit_events where organization_id='${org}' and entity='org_invites'`))[0].n).toBe(1);
    expect((await rows(`select title from public.notifications where user_id='${platformAdmin}' and kind='signup' and organization_id='${org}'`))).toEqual([{ title: "تفعّلت منشأة: روضة الأمل" }]);
    // Used: the same link is refused, and the view says so.
    await as("anon");
    expect((await rows(`select public.accept_org_invite('${token}','second.owner','secret123','ثاني','2026-11-11') as r`))[0].r).toEqual({ ok: false, reason: "used" });
    expect((await rows(`select public.org_invite_view('${token}') as v`))[0].v).toEqual({ valid: false, reason: "used" });
  });
  it("a signed-in person gets the new organization on their own account", async () => {
    await as("authenticated", platformAdmin);
    const token = (await rows(invite("مدرسة الحاضر", 1)))[0].t as string;
    await as("authenticated", staff);
    const result = (await rows(`select public.accept_org_invite('${token}',null,null,'المعلمة','2026-11-11') as r`))[0].r as { ok: boolean; organization_id: string };
    expect(result.ok).toBe(true);
    expect((await rows(`select role from public.memberships where organization_id='${result.organization_id}' and user_id='${staff}'`))[0].role).toBe("owner");
  });
  it("expired and revoked links are refused; reissue gives a new link and stops the old one", async () => {
    await as("authenticated", platformAdmin);
    const expired = (await rows(invite("مدرسة قديمة")))[0].t as string;
    await db.exec("reset role");
    await db.exec(`update private.org_invites set expires_at = now() - interval '1 minute' where org_name = 'مدرسة قديمة'`);
    await as("anon");
    expect((await rows(`select public.accept_org_invite('${expired}','late.owner','secret123','متأخر','2026-11-11') as r`))[0].r).toEqual({ ok: false, reason: "expired" });
    await as("authenticated", platformAdmin);
    const first = (await rows(invite("مدرسة ملغاة")))[0].t as string;
    const id = (await rows("select id from public.admin_org_invites() where org_name = 'مدرسة ملغاة'"))[0].id as string;
    const second = (await rows(`select public.admin_reissue_org_invite('${id}') as t`))[0].t as string;
    expect(second).not.toBe(first);
    await as("anon");
    expect((await rows(`select public.org_invite_view('${first}') as v`))[0].v).toEqual({ valid: false, reason: "revoked" });
    expect((await rows(`select public.org_invite_view('${second}') as v`))[0].v).toMatchObject({ valid: true });
    await as("authenticated", platformAdmin);
    const fresh = (await rows("select id from public.admin_org_invites() where org_name = 'مدرسة ملغاة' and status = 'pending'"))[0].id as string;
    await db.exec(`select public.admin_revoke_org_invite('${fresh}')`);
    const statuses = (await rows("select status from public.admin_org_invites() where org_name in ('مدرسة ملغاة','مدرسة قديمة','روضة الأمل') order by status")).map(row => row.status);
    expect(statuses).toEqual(["expired", "revoked", "revoked", "used"]);
    await db.exec("reset role");
    expect((await rows("select count(*)::int as n from private.platform_audit where action in ('org_invite_revoked','org_invite_reissued','org_invite_used')"))[0].n).toBeGreaterThanOrEqual(3);
  });
  it("limits wrong tokens: after 10 wrong attempts even a valid token is refused for a while", async () => {
    await db.exec("reset role");
    await db.exec("delete from private.org_invite_attempts");
    await as("authenticated", platformAdmin);
    const token = (await rows(invite("مدرسة المحاولات")))[0].t as string;
    await as("anon");
    for (let i = 0; i < 10; i++) expect((await rows(`select public.org_invite_view('wrong-token-${i}') as v`))[0].v).toEqual({ valid: false, reason: "invalid" });
    expect((await rows(`select public.org_invite_view('${token}') as v`))[0].v).toEqual({ valid: false, reason: "blocked" });
    expect((await rows(`select public.accept_org_invite('${token}','x.owner','secret123','س','2026-11-11') as r`))[0].r).toEqual({ ok: false, reason: "blocked" });
    await db.exec("reset role");
    expect(JSON.stringify(await rows("select * from private.org_invite_attempts"))).not.toContain("wrong-token");
    await db.exec("delete from private.org_invite_attempts");
  });
});

describe("support badge: unread until each side opens the thread", () => {
  const platformAdmin = "60000000-0000-0000-0000-0000000000ad";
  const unread = async () => (await rows("select public.support_unread() as u"))[0].u as { mine: string[]; team: string[] | null };
  let thread = "";
  beforeAll(async () => {
    await db.exec("reset role");
    await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${platformAdmin}','admin@seer.test',now()) on conflict do nothing;
      insert into private.platform_admins(user_id) values ('${platformAdmin}') on conflict do nothing;
      delete from public.support_threads where user_id='${owner}'`);
    await as("authenticated", owner);
    thread = (await rows(`select public.open_support_thread('${orgA}','سؤال عن الفواتير','كيف أصدر فاتورة؟')::text as id`))[0].id as string;
  });
  it("a new ticket is unread for the team until an admin opens it; the user has nothing new", async () => {
    await as("authenticated", owner);
    expect(await unread()).toEqual({ mine: [], team: null });
    await as("authenticated", platformAdmin);
    expect((await unread()).team).toContain(thread);
    await db.exec(`select public.mark_support_read('${thread}')`);
    expect((await unread()).team).not.toContain(thread);
  });
  it("the team's reply is unread for the user until they open it; a new user reply is unread for the team again", async () => {
    await as("authenticated", platformAdmin);
    await db.exec(`select public.reply_support('${thread}','من «المالية» اضغط «فاتورة جديدة».')`);
    await as("authenticated", owner);
    expect((await unread()).mine).toEqual([thread]);
    await db.exec(`select public.mark_support_read('${thread}')`);
    expect((await unread()).mine).toEqual([]);
    await db.exec(`select public.reply_support('${thread}','تمام، شكرًا')`);
    await as("authenticated", platformAdmin);
    expect((await unread()).team).toContain(thread);
  });
  it("only the owner or a platform admin can mark a thread read, each on their own side", async () => {
    for (const who of [staff, outsider]) {
      await as("authenticated", who);
      await expect(db.exec(`select public.mark_support_read('${thread}')`)).rejects.toMatchObject({ code: "42501" });
    }
    await as("authenticated", platformAdmin);
    await db.exec(`select public.mark_support_read('${thread}')`);
    await db.exec("reset role");
    const [row] = await rows(`select user_read_at is not null as user_read, admin_read_at >= last_message_at as admin_read from public.support_threads where id='${thread}'`);
    expect(row).toEqual({ user_read: true, admin_read: true });
    await as("anon");
    await expect(db.exec("select public.support_unread()")).rejects.toBeDefined();
  });
});

describe("telegram for platform admins", () => {
  const platformAdmin = "60000000-0000-0000-0000-0000000000ad";
  const chat = 777001, stranger = 777999;
  const handle = async (update: unknown) => {
    await db.exec("reset role");
    await db.exec("set role service_role");
    const result = (await db.query<{ r: Record<string, unknown> }>("select public.telegram_handle($1::jsonb) as r", [JSON.stringify(update)])).rows[0].r;
    await db.exec("reset role");
    return result as { replies?: { chat_id: number; text?: string; invite?: Record<string, unknown> }[]; answer?: { text: string }; clear?: unknown };
  };
  let nextMessage = 1;
  const message = (from: number, text: string, extra: Record<string, unknown> = {}) => ({ update_id: nextMessage, message: { message_id: nextMessage++, chat: { id: from, type: "private" }, from: { id: from, username: "seer_admin" }, text, ...extra } });
  const button = (from: number, data: string, messageId = 1) => ({ update_id: nextMessage++, callback_query: { id: `cb${nextMessage}`, data, message: { message_id: messageId, chat: { id: from, type: "private" } } } });
  const outbox = async () => (await db.exec("reset role"), await rows("select id, chat_id::int as chat, body, buttons, context from private.telegram_outbox where status = 'queued' order by id")) as { id: number; chat: number; body: string; buttons: { text: string; data?: string; url?: string }[]; context: Record<string, string> }[];
  beforeAll(async () => {
    await db.exec("reset role");
    await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${platformAdmin}','admin@seer.test',now()) on conflict do nothing;
      insert into private.platform_admins(user_id) values ('${platformAdmin}') on conflict do nothing;
      delete from private.telegram_links; delete from private.telegram_outbox; delete from private.org_invite_attempts;`);
  });

  it("only a platform admin gets a link code; a wrong code is refused; the right one links the chat once", async () => {
    await as("authenticated", owner);
    await expect(db.exec("select public.telegram_link_code()")).rejects.toMatchObject({ code: "42501" });
    await as("authenticated", platformAdmin);
    const code = (await rows("select public.telegram_link_code() as c"))[0].c as string;
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    await db.exec("reset role");
    expect(JSON.stringify(await rows("select * from private.telegram_link_codes"))).not.toContain(code);
    expect((await handle(message(chat, "/link ZZZZZZZZ"))).replies?.[0].text).toContain("غير صحيح");
    expect((await handle(message(chat, `/link ${code.toLowerCase()}`))).replies?.[0].text).toContain("تم ربط تيليقرام");
    expect(await rows(`select chat_id::int as c from private.telegram_links where user_id='${platformAdmin}'`)).toEqual([{ c: chat }]);
    expect((await handle(message(stranger, `/link ${code}`))).replies?.[0].text).toContain("غير صحيح");
    await as("authenticated", platformAdmin);
    expect((await rows("select public.telegram_status() as s"))[0].s).toMatchObject({ linked: true, username: "seer_admin" });
  });

  it("ignores chats that are not linked, for messages and buttons alike", async () => {
    expect(await handle(message(stranger, "/summary"))).toEqual({});
    expect(await handle(button(stranger, "sc:00000000-0000-0000-0000-000000000000"))).toEqual({});
    expect(await handle({ update_id: 1, message: { message_id: 1, chat: { id: chat, type: "group" }, text: "/summary" } })).toEqual({});
    const summary = await handle(message(chat, "/summary"));
    expect(summary.replies?.[0].text).toContain("تذاكر تنتظر ردّك");
    expect((await handle(message(chat, "/help"))).replies?.[0].text).toContain("/summary");
  });

  it("a new ticket arrives with the organization, page and message, «إقفال» and «فتح في اللوحة»; a Telegram reply reaches the user", async () => {
    await db.exec("reset role");
    await db.exec("delete from private.telegram_outbox; delete from public.support_threads");
    await as("authenticated", staff);
    const thread = (await rows(`select public.open_support_thread('${orgA}','الحضور ما ينحفظ','ضغطت حفظ وما صار شي','/dashboard/attendance?org=x')::text as id`))[0].id as string;
    const [queued] = await outbox();
    expect(queued.chat).toBe(chat);
    expect(queued.body).toContain("تذكرة دعم جديدة");
    expect(queued.body).toContain("الصفحة: /dashboard/attendance");
    expect(queued.body).toContain("ضغطت حفظ وما صار شي");
    expect(queued.buttons).toEqual([{ text: "قوالب الرد", data: `tl:${thread}:0` }, { text: "إقفال", data: `sc:${thread}` }, { text: "فتح في اللوحة", url: `/admin/support/${thread}` }]);
    // The dispatcher sends it and records the Telegram message id; the text is not kept.
    await db.exec("set role service_role");
    const claimed = await rows("select id from public.telegram_claim(10)");
    expect(claimed).toHaveLength(1);
    await db.exec(`select public.telegram_report(${queued.id}, true, 9001, null)`);
    await db.exec("reset role");
    expect(await rows(`select body, status from private.telegram_outbox where id=${queued.id}`)).toEqual([{ body: "", status: "sent" }]);
    // The admin answers with Telegram's «reply».
    const replied = await handle(message(chat, "جرّب تحدّث الصفحة وارجع جرّب", { reply_to_message: { message_id: 9001 } }));
    expect(replied.replies?.[0].text).toContain("وصل ردك");
    expect(await rows(`select from_admin, sender_id::text as who from public.support_messages where thread_id='${thread}' order by created_at desc limit 1`)).toEqual([{ from_admin: true, who: platformAdmin }]);
    expect((await rows(`select count(*)::int as n from public.notifications where user_id='${staff}' and kind='support' and title='رد من فريق سِير'`))[0].n).toBeGreaterThan(0);
    // «إقفال» closes it as the linked admin.
    const closed = await handle(button(chat, `sc:${thread}`, 9001));
    expect(closed.answer?.text).toContain("أُغلقت");
    expect(closed.clear).toBeTruthy();
    expect((await rows(`select status from public.support_threads where id='${thread}'`))[0].status).toBe("closed");
    expect(await rows(`select action, actor_id::text as actor from private.platform_audit where action in ('telegram_reply_ticket','telegram_close_ticket') order by id`)).toEqual([
      { action: "telegram_reply_ticket", actor: platformAdmin }, { action: "telegram_close_ticket", actor: platformAdmin }]);
  });

  it("transfer buttons: «اعتماد» approves as the linked admin; «رفض» asks for the reason and rejects with it", async () => {
    await db.exec("reset role");
    await db.exec("delete from private.telegram_outbox");
    const advanced = (await rows("select id from public.plans where key='advanced'"))[0].id as string;
    await as("authenticated", owner);
    await db.exec(`insert into storage.objects(bucket_id,name) values ('subscription-receipts','${orgA}/receipt-tg1.jpg'),('subscription-receipts','${orgA}/receipt-tg2.jpg')`);
    const first = (await rows(`select public.submit_subscription_payment('${orgA}','${advanced}',1,'TG-REF-1','${orgA}/receipt-tg1.jpg')::text as id`))[0].id as string;
    const [queued] = await outbox();
    expect(queued.body).toContain("تحويل بنكي جديد");
    expect(queued.buttons.map(b => b.data ?? b.url)).toEqual([`pa:${first}`, `pr:${first}`, "/admin/payments"]);
    const approved = await handle(button(chat, `pa:${first}`));
    expect(approved.replies?.[0].text).toContain("اعتُمد التحويل");
    await db.exec("reset role");
    expect(await rows(`select status, decided_by::text as by from public.subscription_payments where id='${first}'`)).toEqual([{ status: "approved", by: platformAdmin }]);
    // Pressing again does nothing harmful.
    expect((await handle(button(chat, `pa:${first}`))).answer?.text).toContain("من قبل");
    await as("authenticated", owner);
    const second = (await rows(`select public.submit_subscription_payment('${orgA}','${advanced}',1,'TG-REF-2','${orgA}/receipt-tg2.jpg')::text as id`))[0].id as string;
    expect((await handle(button(chat, `pr:${second}`))).replies?.[0].text).toContain("اكتب سبب");
    expect((await handle(message(chat, "المبلغ ناقص ٥٠ ريال"))).replies?.[0].text).toContain("رُفض التحويل");
    await db.exec("reset role");
    expect(await rows(`select status, reject_reason from public.subscription_payments where id='${second}'`)).toEqual([{ status: "rejected", reject_reason: "المبلغ ناقص ٥٠ ريال" }]);
    await db.exec(`update public.subscriptions set ends_on = (now() at time zone 'Asia/Riyadh')::date + 365, status = 'active' where organization_id='${orgA}'`);
  });

  it("join requests: checks, spam limits, then «أرسل دعوة» creates a 3-month invite and returns its token once", async () => {
    await db.exec("reset role");
    await db.exec("delete from private.telegram_outbox; delete from private.join_requests");
    await as("anon");
    const submit = (phone: string, name = "مدرسة الريادة", website = "") => `select public.submit_join_request('${name}','school','الرياض','أبو خالد','${phone}',250,'${website}') as r`;
    await expect(db.exec(submit("12345"))).rejects.toMatchObject({ code: "22023" });
    expect((await rows(submit("0555555555", "روبوت", "http://spam.test")))[0].r).toBe("ok");
    expect((await rows(submit("+966 55 111 2222")))[0].r).toBe("ok");
    expect((await rows(submit("0551112222")))[0].r).toBe("ok"); // same phone again: no duplicate
    await db.exec("reset role");
    expect(await rows("select org_name, phone, status from private.join_requests")).toEqual([{ org_name: "مدرسة الريادة", phone: "0551112222", status: "new" }]);
    await as("anon");
    await db.exec(submit("0551112223", "مدرسة ٢"));
    await db.exec(submit("0551112224", "مدرسة ٣"));
    await expect(db.exec(submit("0551112225", "مدرسة ٤"))).rejects.toMatchObject({ code: "54000" });
    const queued = await outbox();
    expect(queued[0].body).toContain("طلب انضمام");
    const request = queued[0].buttons[0].data!.slice(3);
    expect(queued[0].buttons.map(b => b.text)).toEqual(["أرسل دعوة", "رفض"]);
    const invited = await handle(button(chat, `ji:${request}`));
    const invite = invited.replies?.[0].invite as { token: string; org_name: string; phone: string; trial_months: number };
    expect(invite).toMatchObject({ org_name: "مدرسة الريادة", phone: "0551112222", trial_months: 3 });
    expect(invite.token).toMatch(/^[A-HJ-NP-Za-km-z2-9]{32}$/);
    await db.exec("reset role");
    expect(await rows("select status, (invite_id is not null) as has_invite from private.join_requests where org_name='مدرسة الريادة'")).toEqual([{ status: "invited", has_invite: true }]);
    expect(await rows("select trial_months, created_by::text as by from private.org_invites order by created_at desc limit 1")).toEqual([{ trial_months: 3, by: platformAdmin }]);
    expect(JSON.stringify(await rows("select * from private.telegram_outbox"))).not.toContain(invite.token);
    const other = (await rows("select id from private.join_requests where org_name='مدرسة ٢'"))[0].id as string;
    expect((await handle(button(chat, `jr:${other}`))).answer?.text).toContain("رُفض");
    await as("authenticated", platformAdmin);
    expect((await rows("select status from public.admin_join_requests() order by status")).map(row => row.status)).toEqual(["invited", "new", "rejected"]);
    await as("authenticated", owner);
    await expect(db.exec("select * from public.admin_join_requests()")).rejects.toMatchObject({ code: "42501" });
  });

  it("errors alert once an hour; the daily run sends the summary and subscriptions ending soon", async () => {
    await db.exec("reset role");
    await db.exec("delete from private.telegram_outbox; delete from private.telegram_alerts");
    await db.exec("insert into public.system_errors(fingerprint, kind, message, route) values (repeat('a',32), 'server', 'Cannot read properties of undefined', '/dashboard/x')");
    await db.exec("update public.system_errors set status = 'resolved' where fingerprint = repeat('a',32)");
    await db.exec("update public.system_errors set status = 'new', regressed = true where fingerprint = repeat('a',32)");
    const alerts = (await outbox()).filter(row => row.body.includes("خطأ تشغيل"));
    expect(alerts).toHaveLength(1);
    await db.exec(`update public.subscriptions set ends_on = (now() at time zone 'Asia/Riyadh')::date + 3 where organization_id='${orgA}'`);
    await db.exec("delete from private.telegram_outbox");
    await db.exec("select private.telegram_daily()");
    const daily = (await outbox()).map(row => row.body);
    expect(daily[0]).toContain("ملخص سِير");
    expect(daily[1]).toContain("تنتهي خلال ٧ أيام");
    await db.exec(`update public.subscriptions set ends_on = (now() at time zone 'Asia/Riyadh')::date + 365 where organization_id='${orgA}'`);
  });

  it("failed sends retry with backoff and give up after 5 attempts; a removed admin is unlinked", async () => {
    await db.exec("reset role");
    await db.exec("delete from private.telegram_outbox");
    await db.exec(`select private.telegram_queue('رسالة تجربة')`);
    for (let attempt = 1; attempt <= 5; attempt++) {
      await db.exec("update private.telegram_outbox set next_attempt_at = now() - interval '1 second' where status = 'queued'");
      await db.exec("set role service_role");
      const [row] = await rows("select id from public.telegram_claim(5)");
      await db.exec(`select public.telegram_report(${row.id}, false, null, 'network')`);
      await db.exec("reset role");
    }
    expect(await rows("select status, attempts from private.telegram_outbox")).toEqual([{ status: "failed", attempts: 5 }]);
    await as("anon");
    await expect(db.exec("select public.telegram_claim(5)")).rejects.toBeDefined();
    await expect(db.exec(`select public.telegram_handle('{}'::jsonb)`)).rejects.toBeDefined();
    await db.exec("reset role");
    await db.exec(`delete from private.platform_admins where user_id='${platformAdmin}'`);
    expect(await rows("select * from private.telegram_links")).toEqual([]);
    await db.exec(`insert into private.platform_admins(user_id) values ('${platformAdmin}')`);
  });
});

describe("support reply templates", () => {
  const platformAdmin = "60000000-0000-0000-0000-0000000000ad";
  const chat = 778001;
  type Handled = { replies?: { chat_id: number; text?: string; buttons?: { text: string; data?: string; url?: string; wide?: boolean }[] }[]; answer?: { text: string }; clear?: unknown };
  const handle = async (update: unknown, site = "https://seersa.vercel.app") => {
    await db.exec("reset role");
    await db.exec("set role service_role");
    const result = (await db.query<{ r: Handled }>("select public.telegram_handle($1::jsonb, $2) as r", [JSON.stringify(update), site])).rows[0].r;
    await db.exec("reset role");
    return result;
  };
  let id = 50000;
  const button = (data: string) => ({ update_id: id++, callback_query: { id: `cb${id}`, data, message: { message_id: 1, chat: { id: chat, type: "private" } } } });
  const text = (body: string) => ({ update_id: id, message: { message_id: id++, chat: { id: chat, type: "private" }, text: body } });
  const openTicket = async (subject: string, body: string) => {
    await as("authenticated", staff);
    const thread = (await rows(`select public.open_support_thread('${orgA}','${subject}','${body}',null)::text as id`))[0].id as string;
    await db.exec("reset role");
    return thread;
  };
  beforeAll(async () => {
    await db.exec("reset role");
    await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${platformAdmin}','admin@seer.test',now()) on conflict do nothing;
      insert into private.platform_admins(user_id) values ('${platformAdmin}') on conflict do nothing;
      delete from private.telegram_links; insert into private.telegram_links(user_id, chat_id) values ('${platformAdmin}', ${chat});
      delete from public.support_threads; delete from private.telegram_outbox;`);
  });

  it("are seeded for the common questions, each with steps and a page inside the platform", async () => {
    const seeded = await rows("select title, body, path from private.support_templates order by sort_order") as { title: string; body: string; path: string }[];
    expect(seeded.length).toBeGreaterThanOrEqual(14);
    for (const title of ["إضافة موظف أو مستخدم", "إضافة طالب واستيراد Excel", "ربط ولي الأمر والمصرّح لهم بالاستلام", "الفصول والهيكل الدراسي", "تسجيل الحضور", "التقرير اليومي", "الإعلانات", "رابط بوابة ولي الأمر", "تشغيل وإطفاء الأقسام", "تغيير كلمة المرور", "تثبيت التطبيق والإشعارات", "المالية والفواتير", "النقل", "الاشتراك"]) {
      expect(seeded.map(row => row.title)).toContain(title);
    }
    for (const row of seeded) expect(row.path).toMatch(/^\/dashboard(\/[a-z-]+)*(#[a-z]+)?$/);
    expect(seeded.find(row => row.title === "إضافة موظف أو مستخدم")?.body).toContain("إنشاء رابط انضمام");
    expect(seeded.find(row => row.title === "تغيير كلمة المرور")?.body).toContain("كلمة مرور جديدة");
  });

  it("are for platform admins only: reading, adding and editing", async () => {
    for (const user of [owner, staff, outsider]) {
      await as("authenticated", user);
      await expect(db.exec("select * from public.admin_support_templates()")).rejects.toMatchObject({ code: "42501" });
      await expect(db.exec("select public.admin_save_support_template(null,'عنوان','نص الرد هنا')")).rejects.toMatchObject({ code: "42501" });
      await expect(db.exec("select * from private.support_templates")).rejects.toBeDefined();
    }
    await as("anon");
    await expect(db.exec("select * from public.admin_support_templates()")).rejects.toBeDefined();
    await as("authenticated", platformAdmin);
    const created = (await rows("select public.admin_save_support_template(null,'تجربة قالب','هذا نص تجربة','/dashboard/team',array['تجربه'],999,true) as id"))[0].id as number;
    await expect(db.exec("select public.admin_save_support_template(null,'رابط خارجي','هذا نص تجربة','https://evil.test')")).rejects.toMatchObject({ code: "22023" });
    await expect(db.exec("select public.admin_save_support_template(null,'رابط','هذا نص تجربة','/admin/support')")).rejects.toMatchObject({ code: "22023" });
    await expect(db.exec("select public.admin_save_support_template(null,'x','نص')")).rejects.toMatchObject({ code: "22023" });
    await expect(db.exec("select public.admin_save_support_template(987654,'عنوان','هذا نص تجربة')")).rejects.toMatchObject({ code: "P0002" });
    await db.exec(`select public.admin_save_support_template(${created},'تجربة معدّلة','نص معدّل للتجربة',null,null,null,false)`);
    expect(await rows(`select title, path, keywords, sort_order, is_active from public.admin_support_templates() where id=${created}`)).toEqual([{ title: "تجربة معدّلة", path: null, keywords: ["تجربه"], sort_order: 999, is_active: false }]);
    await db.exec("reset role");
    expect((await rows("select action from private.platform_audit where action like 'template_%' order by id")).map(row => row.action)).toEqual(["template_created", "template_updated"]);
    await db.exec(`delete from private.support_templates where id=${created}`);
  });

  it("suggests the closest template from the ticket's words, and none when nothing matches", async () => {
    const attendance = await openTicket("مشكلة في الحضور", "ما أعرف أسجّل غياب الطلاب");
    const nothing = await openTicket("سؤال", "شكرًا لكم");
    await as("authenticated", platformAdmin);
    const [first] = await rows(`select title, suggested from public.admin_support_templates('${attendance}')`);
    expect(first).toEqual({ title: "تسجيل الحضور", suggested: true });
    expect((await rows(`select count(*)::int as n from public.admin_support_templates('${nothing}') where suggested`))[0].n).toBe(0);
    expect((await rows(`select title from public.admin_support_templates('${nothing}') limit 1`))[0].title).toBe("إضافة موظف أو مستخدم");
  });

  it("Telegram: «قوالب الرد» lists them (suggested first, in pages); choosing one replies with the full link, as the linked admin", async () => {
    const thread = await openTicket("كيف أضيف معلمة", "أبي أضيف موظفه جديدة للفريق");
    const menu = await handle(button(`tl:${thread}:0`));
    const buttons = menu.replies?.[0].buttons ?? [];
    expect(buttons[0]).toMatchObject({ text: "⭐ المقترح: إضافة موظف أو مستخدم", wide: true });
    expect(buttons.filter(b => b.data?.startsWith("ts:"))).toHaveLength(7);
    expect(buttons.at(-1)).toEqual({ text: "التالي ›", data: `tl:${thread}:1` });
    for (const b of buttons) expect(new TextEncoder().encode(b.data ?? "").length).toBeLessThanOrEqual(64);
    const second = (await handle(button(`tl:${thread}:1`))).replies?.[0].buttons ?? [];
    expect(second.some(b => b.text.startsWith("⭐"))).toBe(false);
    expect(second.map(b => b.text)).toContain("‹ السابق");
    const allTitles = [...buttons, ...second, ...((await handle(button(`tl:${thread}:2`))).replies?.[0].buttons ?? [])].filter(b => b.data?.startsWith("ts:")).map(b => b.text);
    expect(new Set(allTitles).size).toBe(allTitles.length);

    const sent = await handle(button(buttons[0].data!), "https://seersa.vercel.app");
    expect(sent.answer?.text).toContain("أُرسل");
    expect(sent.replies?.[0].text).toContain("«إضافة موظف أو مستخدم»");
    const [reply] = await rows(`select body, from_admin, sender_id::text as who from public.support_messages where thread_id='${thread}' and from_admin`) as { body: string; from_admin: boolean; who: string }[];
    expect(reply.who).toBe(platformAdmin);
    expect(reply.body).toContain("إنشاء رابط انضمام");
    expect(reply.body.endsWith("🔗 https://seersa.vercel.app/dashboard/team")).toBe(true);
    expect((await rows(`select count(*)::int as n from private.platform_audit where action='telegram_template_reply' and actor_id='${platformAdmin}'`))[0].n).toBe(1);
    // A disabled template or a closed ticket is refused.
    await db.exec(`update private.support_templates set is_active=false where title='النقل'`);
    const transport = (await rows("select id from private.support_templates where title='النقل'"))[0].id;
    expect((await handle(button(`ts:${thread}:${transport}`))).answer?.text).toContain("معطّل");
    await db.exec(`update private.support_templates set is_active=true where title='النقل'`);
    await db.exec(`update public.support_threads set status='closed' where id='${thread}'`);
    expect((await handle(button(`ts:${thread}:${transport}`))).answer?.text).toContain("مغلقة");
  });

  it("Telegram: /templates lists them; unlinked chats get nothing; a non-official site is ignored", async () => {
    const listed = await handle(text("/templates"));
    expect(listed.replies?.[0].text).toContain("• تسجيل الحضور — /dashboard/attendance");
    expect(listed.replies?.[0].buttons).toEqual([{ text: "إدارة القوالب", url: "/admin/support/templates" }]);
    expect((await handle(text("/help"))).replies?.[0].text).toContain("/templates");
    expect(await handle({ update_id: 1, message: { message_id: 1, chat: { id: 4242, type: "private" }, text: "/templates" } })).toEqual({});
    const thread = await openTicket("الاشتراك", "متى ينتهي الاشتراك");
    const menu = await handle(button(`tl:${thread}:0`));
    await handle(button(menu.replies![0].buttons![0].data!), "javascript:alert(1)");
    const [reply] = await rows(`select body from public.support_messages where thread_id='${thread}' and from_admin`) as { body: string }[];
    expect(reply.body.endsWith("🔗 https://seersa.vercel.app/dashboard/billing")).toBe(true);
  });

  it("every function the service-role routes call is executable by service_role (public and private)", async () => {
    const files = ["app/api/telegram/webhook/route.ts", "app/api/telegram/dispatch/route.ts", "app/api/messages/dispatch/route.ts", "app/api/payments/webhook/[provider]/route.ts"];
    for (const file of readdirSync("app/api", { recursive: true }).map(String).filter(name => name.endsWith(".ts")).map(name => `app/api/${name}`)) {
      if (/serviceClient\(|SUPABASE_SERVICE_ROLE_KEY/.test(readFileSync(file, "utf8"))) expect(files).toContain(file);
    }
    const names = new Set<string>();
    for (const file of files) for (const match of readFileSync(file, "utf8").matchAll(/\.rpc\("([a-z_]+)"/g)) names.add(match[1]);
    expect([...names]).toEqual(expect.arrayContaining(["telegram_handle", "telegram_claim_kick", "telegram_claim", "telegram_report", "telegram_track"]));
    await db.exec("reset role");
    const missing: string[] = [];
    for (const name of names) {
      const found = await rows(`select n.nspname as schema, p.oid::regprocedure::text as signature, has_function_privilege('service_role', p.oid, 'execute') as allowed
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.proname = '${name}' and n.nspname in ('public','private')`) as { schema: string; signature: string; allowed: boolean }[];
      if (!found.some(row => row.schema === "public")) missing.push(`public.${name} does not exist`);
      for (const row of found) if (!row.allowed) missing.push(row.signature);
    }
    expect(missing).toEqual([]);
  });
});

describe("guided setup (onboarding)", () => {
  const orgC = "c2000000-0000-0000-0000-0000000000c1";
  const boss = "c1000000-0000-0000-0000-0000000000c1", helper = "c1000000-0000-0000-0000-0000000000c2", teacher = "c1000000-0000-0000-0000-0000000000c3";
  const platformAdmin = "60000000-0000-0000-0000-0000000000ad";
  type Status = { track: string; steps: { step: string; done: boolean; markable: boolean }[]; done: number; total: number; complete: boolean; started: boolean; snooze_count: number; snoozed_until: string | null; show_welcome: boolean };
  const call = async (user: string, sql: string) => { await as("authenticated", user); const r = (await rows(sql))[0]; await db.exec("reset role"); return Object.values(r)[0] as Status; };
  const status = (user: string) => call(user, `select public.onboarding_status('${orgC}') as s`);
  const doneOf = (s: Status) => s.steps.filter(x => x.done).map(x => x.step);
  beforeAll(async () => {
    await db.exec("reset role");
    await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${boss}','boss@c.test',now()),('${helper}','helper@c.test',now()),('${teacher}','teacher@c.test',now()),('${platformAdmin}','admin@seer.test',now()) on conflict do nothing;
      insert into private.platform_admins(user_id) values ('${platformAdmin}') on conflict do nothing;
      delete from private.telegram_links; insert into private.telegram_links(user_id, chat_id) values ('${platformAdmin}', 779001);
      insert into public.organizations(id,name,type) values ('${orgC}','روضة التأسيس','kindergarten');
      insert into public.memberships(organization_id,user_id,role) values ('${orgC}','${boss}','owner'),('${orgC}','${teacher}','staff');`);
  });

  it("owners get the organization steps in order; the welcome screen shows until «ابدأ» or a snooze", async () => {
    const first = await status(boss);
    expect(first.track).toBe("org");
    expect(first.steps.map(s => s.step)).toEqual(["profile", "device", "sections", "classes", "students", "guardians", "team", "attendance", "daily", "portal"]);
    expect(first).toMatchObject({ done: 1, total: 10, complete: false, started: false, show_welcome: true }); // team: the teacher is already a member
    expect(doneOf(first)).toEqual(["team"]);
    const started = await call(boss, `select public.onboarding_start('${orgC}') as s`);
    expect(started).toMatchObject({ started: true, show_welcome: false, complete: false });
  });

  it("steps are done automatically from the real data", async () => {
    await db.exec(`update public.memberships set display_name='أبو فهد' where organization_id='${orgC}' and user_id='${boss}';
      insert into public.member_phones(organization_id,user_id,phone) values ('${orgC}','${boss}','0551234567');
      insert into public.grade_levels(id,organization_id,name,stage,sort_order) values ('c7000000-0000-0000-0000-0000000000c1','${orgC}','KG1','kindergarten',1);
      insert into public.sections(organization_id,grade_level_id,name) values ('${orgC}','c7000000-0000-0000-0000-0000000000c1','أ');
      insert into public.children(id,organization_id,full_name) values ('c3000000-0000-0000-0000-0000000000c1','${orgC}','طفل');
      insert into public.guardians(id,organization_id,full_name,phone) values ('c4000000-0000-0000-0000-0000000000c1','${orgC}','ولي','0550000001');
      insert into public.child_guardians(organization_id,child_id,guardian_id,relationship) values ('${orgC}','c3000000-0000-0000-0000-0000000000c1','c4000000-0000-0000-0000-0000000000c1','father');
      insert into public.attendance(organization_id,child_id,attendance_date,status,recorded_by) values ('${orgC}','c3000000-0000-0000-0000-0000000000c1',current_date,'present','${boss}');`);
    expect(doneOf(await status(boss))).toEqual(["profile", "classes", "students", "guardians", "team", "attendance"]);
    await db.exec(`insert into public.daily_reports(organization_id,child_id,report_date,mood,updated_by) values ('${orgC}','c3000000-0000-0000-0000-0000000000c1',current_date,'happy','${boss}');
      insert into private.guardian_portals(guardian_id,organization_id) values ('c4000000-0000-0000-0000-0000000000c1','${orgC}');
      insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values ('${boss}','https://push.example.test/c1','${"k".repeat(40)}','${"a".repeat(16)}');`);
    const s = await status(boss);
    expect(s.done).toBe(9);
    expect(s.steps.filter(x => !x.done)).toEqual([{ step: "sections", done: false, markable: true }]);
  });

  it("only unmeasurable steps can be marked; marking the last one completes the setup", async () => {
    await as("authenticated", boss);
    await expect(db.exec(`select public.onboarding_mark('${orgC}','students')`)).rejects.toMatchObject({ code: "22023" });
    await expect(db.exec(`select public.onboarding_mark('${orgC}','anything')`)).rejects.toMatchObject({ code: "22023" });
    const done = await call(boss, `select public.onboarding_mark('${orgC}','sections') as s`);
    expect(done).toMatchObject({ done: 10, total: 10, complete: true, show_welcome: false });
    expect((await rows(`select completed_at is not null as c from public.onboarding_progress where organization_id='${orgC}' and user_id='${boss}'`))[0].c).toBe(true);
    // A completed setup stays completed (and snoozing does nothing).
    expect((await call(boss, `select public.onboarding_snooze('${orgC}') as s`)).snooze_count).toBe(0);
  });

  it("a section that is turned off drops its step", async () => {
    await db.exec(`insert into public.organization_settings(organization_id, disabled_features) values ('${orgC}', array['daily']) on conflict (organization_id) do update set disabled_features = array['daily']`);
    expect((await status(boss)).steps.map(s => s.step)).not.toContain("daily");
    await db.exec(`update public.organization_settings set disabled_features = '{}' where organization_id='${orgC}'`);
  });

  it("staff get the short tour; their attendance and daily steps follow what they recorded, or are marked", async () => {
    const s = await status(teacher);
    expect(s.track).toBe("staff");
    expect(s.steps.map(x => x.step)).toEqual(["profile", "device", "attendance", "daily", "my", "support"]);
    expect(s.done).toBe(0); // the owner's attendance does not count for the teacher
    await db.exec(`update public.attendance set recorded_by='${teacher}' where organization_id='${orgC}'`);
    expect(doneOf(await status(teacher))).toEqual(["attendance"]);
    for (const step of ["my", "support", "daily", "device"]) await call(teacher, `select public.onboarding_mark('${orgC}','${step}') as s`);
    await as("authenticated", teacher);
    await expect(db.exec(`select public.onboarding_mark('${orgC}','profile')`)).rejects.toMatchObject({ code: "22023" });
    await db.exec("reset role");
    expect((await status(teacher)).done).toBe(5);
  });

  it("«ذكّرني بعدين» hides the welcome for 12 hours; the third snooze alerts the platform admins once (Telegram too)", async () => {
    await db.exec(`insert into public.memberships(organization_id,user_id,role) values ('${orgC}','${helper}','admin')`);
    await db.exec("delete from private.telegram_outbox");
    let s = await call(helper, `select public.onboarding_snooze('${orgC}') as s`);
    expect(s).toMatchObject({ track: "org", snooze_count: 1, show_welcome: false, complete: false });
    expect(Date.parse(s.snoozed_until!) - Date.now()).toBeGreaterThan(11.9 * 3600_000);
    await db.exec(`update public.onboarding_progress set snoozed_until = now() - interval '1 minute' where user_id='${helper}'`);
    expect((await status(helper)).show_welcome).toBe(true);
    await call(helper, `select public.onboarding_snooze('${orgC}') as s`);
    expect((await rows(`select count(*)::int as n from public.notifications where kind='onboarding'`))[0].n).toBe(0);
    await call(helper, `select public.onboarding_snooze('${orgC}') as s`);
    await call(helper, `select public.onboarding_snooze('${orgC}') as s`);
    const alerts = await rows(`select user_id::text as who, title, body, url from public.notifications where kind='onboarding'`);
    expect(alerts).toEqual([{ who: platformAdmin, title: "منشأة متعثرة في التأسيس: روضة التأسيس", body: "أجّلت التجهيز 3 مرات، وأنجزت 7 من 10 خطوات.", url: `/admin/subscribers/${orgC}` }]);
    expect((await rows("select body from private.telegram_outbox")).map(r => r.body)).toEqual([expect.stringContaining("منشأة متعثرة في التأسيس")]);
  });

  it("progress is private: members read only their own row and change it only through the functions", async () => {
    await as("authenticated", teacher);
    expect((await rows("select user_id::text as u from public.onboarding_progress")).map(r => r.u)).toEqual([teacher]);
    await expect(db.exec(`update public.onboarding_progress set completed_at = now() where user_id='${teacher}'`)).rejects.toBeDefined();
    await expect(db.exec(`insert into public.onboarding_progress(organization_id,user_id,track) values ('${orgA}','${teacher}','staff')`)).rejects.toBeDefined();
    await as("authenticated", outsider);
    expect(await rows("select * from public.onboarding_progress")).toEqual([]);
    await expect(db.exec(`select public.onboarding_status('${orgC}')`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`select public.onboarding_snooze('${orgC}')`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec("select * from public.admin_onboarding()")).rejects.toMatchObject({ code: "42501" });
    await as("anon");
    await expect(db.exec(`select public.onboarding_status('${orgC}')`)).rejects.toBeDefined();
    await as("authenticated", platformAdmin);
    expect((await rows("select count(*)::int as n from public.onboarding_progress"))[0].n).toBeGreaterThanOrEqual(3);
  });

  it("support has reply templates about the guide, suggested for tickets that ask about it", async () => {
    expect(await rows("select title, path from private.support_templates where title in ('تشغيل الشرح','شرح صفحة معيّنة') order by sort_order")).toEqual([
      { title: "تشغيل الشرح", path: "/dashboard/settings#help" }, { title: "شرح صفحة معيّنة", path: "/dashboard/assistant" }]);
    expect((await rows("select body from private.support_templates where title='تشغيل الشرح'"))[0].body).toContain("«شغّل الشرح»");
    await as("authenticated", teacher);
    const thread = (await rows(`select public.open_support_thread('${orgC}','ما عرفت من وين أبدأ','وين ألقى الشرح؟ أبي جولة على المنصة',null)::text as id`))[0].id as string;
    await as("authenticated", platformAdmin);
    expect((await rows(`select title from public.admin_support_templates('${thread}') where suggested`))).toEqual([{ title: "تشغيل الشرح" }]);
    await db.exec("reset role");
  });

  it("the admin console sees each organization's setup (owner's track) and who is stuck; the daily summary lists them", async () => {
    await as("authenticated", platformAdmin);
    const all = await rows("select organization_id::text as org, done, total, missing, stuck from public.admin_onboarding()") as { org: string; done: number; total: number; missing: string[]; stuck: boolean }[];
    expect(all.find(r => r.org === orgC)).toEqual({ org: orgC, done: 10, total: 10, missing: [], stuck: false });
    const a = all.find(r => r.org === orgA)!;
    expect(a.missing.length).toBeGreaterThan(0);
    await db.exec("reset role");
    // Joined 10 days ago (the identity trigger is bypassed for the test).
    await db.exec(`set session_replication_role = replica; update public.memberships set joined_at = now() - interval '10 days' where organization_id='${orgA}' and role='owner'; set session_replication_role = default;`);
    await as("authenticated", platformAdmin);
    expect((await rows(`select stuck from public.admin_onboarding() where organization_id='${orgA}'`))[0].stuck).toBe(true);
    await db.exec("reset role");
    await db.exec("delete from private.telegram_outbox");
    await db.exec("select private.telegram_daily()");
    const stuck = (await rows("select body from private.telegram_outbox")).map(r => r.body as string).find(b => b.includes("متعثرة في التأسيس"));
    expect(stuck).toContain((await rows(`select name from public.organizations where id='${orgA}'`))[0].name as string);
    expect(stuck).not.toContain("روضة التأسيس");
  });
});
