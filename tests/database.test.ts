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
    await expect(db.exec(`insert into public.child_guardians values ('${orgA}','${childA}','${guardianB}','parent')`)).rejects.toMatchObject({code:"23503"});
  });
  it("an administrator of both tenants still cannot move a record between them", async () => {
    await db.exec(`insert into public.memberships values ('${orgB}','${owner}','admin')`);
    await as("authenticated",owner);
    await expect(db.exec(`update public.children set organization_id='${orgB}' where id='${childA}'`)).rejects.toMatchObject({code:"23514"});
    await db.exec("reset role"); await db.exec(`delete from public.memberships where organization_id='${orgB}' and user_id='${owner}'`);
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
    expect(await rows(`update public.memberships set role='owner' where user_id='${staff}' returning user_id`)).toEqual([]);
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
