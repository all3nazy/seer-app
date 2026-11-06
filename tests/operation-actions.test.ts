import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), revalidate: vi.fn() }));
vi.mock("../lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { saveOperation, saveOrganization } from "../app/dashboard/operations/actions";
const org = "11111111-1111-4111-8111-111111111111";
const recordId = "22222222-2222-4222-8222-222222222222";
const childId = "33333333-3333-4333-8333-333333333333";
type Call = { table: string; operation: string; values?: unknown; filters: [string, unknown][] };
function fakeClient({ role = "admin", authenticated = true, reference = true, writeResult = true, writeError = false } = {}) {
  const calls: Call[] = [];
  return {
    calls,
    auth: { getUser: vi.fn(async () => ({ data: { user: authenticated ? { id: "user-id" } : null }, error: null })) },
    from(table: string) {
      const call: Call = { table, operation: "read", filters: [] };
      calls.push(call);
      const query = {
        select() { return query; },
        eq(column: string, value: unknown) { call.filters.push([column, value]); return query; },
        insert(values: unknown) { call.operation = "insert"; call.values = values; return query; },
        update(values: unknown) { call.operation = "update"; call.values = values; return query; },
        async maybeSingle() {
          if (table === "memberships") return { data: role === "missing" ? null : { role }, error: null };
          if (call.operation !== "read") return { data: writeResult ? { id: recordId } : null, error: writeError ? { message: "private database detail" } : null };
          return { data: reference ? { id: childId } : null, error: null };
        },
      };
      return query;
    },
  };
}
function form(values: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries({ confirmed: "yes", organization_id: org, entity: "branches", name: "فرع", ...values }).forEach(([key, value]) => data.set(key, value));
  return data;
}
beforeEach(() => vi.clearAllMocks());
describe("operation action boundaries", () => {
  it("requires confirmation before any session/database access", async () => {
    const result = await saveOperation({}, form({ confirmed: "" }));
    expect(result.error).toBeTruthy();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated writes before membership/data queries", async () => {
    const client = fakeClient({ authenticated: false }); mocks.createClient.mockResolvedValue(client);
    expect((await saveOperation({}, form())).error).toBeTruthy();
    expect(client.calls).toEqual([]);
  });
  it.each(["staff", "missing", "authenticated"])("rejects non-managing role %s", async role => {
    const client = fakeClient({ role }); mocks.createClient.mockResolvedValue(client);
    expect((await saveOperation({}, form())).error).toBeTruthy();
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]).toMatchObject({ table: "memberships", filters: [["organization_id", org], ["user_id", "user-id"]] });
  });
  it("rejects an inaccessible foreign child without attempting an insert", async () => {
    const client = fakeClient({ reference: false }); mocks.createClient.mockResolvedValue(client);
    const result = await saveOperation({}, form({ entity: "enrollments", child_id: childId, status: "pending" }));
    expect(result.error).toBeTruthy();
    expect(client.calls[1]).toMatchObject({ table: "children", filters: [["organization_id", org], ["id", childId]] });
    expect(client.calls.some(call => call.operation === "insert")).toBe(false);
  });
  it("scopes updates by both record and tenant and omits client tenant values", async () => {
    const client = fakeClient(); mocks.createClient.mockResolvedValue(client);
    const result = await saveOperation({}, form({ record_id: recordId, role: "owner" }));
    expect(result.success).toBeTruthy();
    expect(client.calls[1]).toEqual({ table: "branches", operation: "update", values: { name: "فرع" }, filters: [["id", recordId], ["organization_id", org]] });
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard");
  });
  it("does not report success for zero updated rows or expose database details", async () => {
    const client = fakeClient({ writeResult: false, writeError: true }); mocks.createClient.mockResolvedValue(client);
    const result = await saveOperation({}, form({ record_id: recordId }));
    expect(result.error).toBeTruthy();
    expect(result.error).not.toContain("private database detail");
    expect(result.success).toBeUndefined();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("restricts organization settings to an authorized tenant and writable columns", async () => {
    const client = fakeClient(); mocks.createClient.mockResolvedValue(client);
    const result = await saveOrganization({}, form({ name: "مدرسة", type: "school", user_id: childId }));
    expect(result.success).toBeTruthy();
    expect(client.calls[1]).toEqual({ table: "organizations", operation: "update", values: { name: "مدرسة", type: "school" }, filters: [["id", org]] });
  });
});
