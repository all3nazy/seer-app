import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

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
    create table auth.users(id uuid primary key, email_confirmed_at timestamptz);
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
  await db.exec(`
    insert into auth.users values ('${owner}',now()),('${staff}',now()),('${outsider}',now()),('${unverified}',null);
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
