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

beforeAll(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email_confirmed_at timestamptz, email text);
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
