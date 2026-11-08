import { describe, expect, it } from "vitest";
import { canManage, operationValues, organizationValues, uuid, ValidationError } from "../lib/operations";
const child = "11111111-1111-4111-8111-111111111111";
const branch = "22222222-2222-4222-8222-222222222222";
function data(values: Record<string, string>) {
  const result = new FormData();
  Object.entries(values).forEach(([key, value]) => result.set(key, value));
  return result;
}
describe("operation validation", () => {
  it("permits managers only, without falling back to authenticated status", () => {
    expect(canManage("owner")).toBe(true);
    expect(canManage("admin")).toBe(true);
    for (const role of ["staff", "authenticated", "superadmin", undefined]) expect(canManage(role)).toBe(false);
  });
  it("ignores untrusted tenant, membership and ID fields in mutable values", () => {
    const result = operationValues("children", data({ full_name: "  أحمد  ", organization_id: branch, id: child, role: "owner", user_id: branch }));
    expect(result).toEqual({ full_name: "أحمد", date_of_birth: null });
  });
  it.each(["", "   ", "أ".repeat(121)])("rejects invalid names", name => {
    expect(() => operationValues("branches", data({ name }))).toThrow(ValidationError);
  });
  it.each(["2025-02-30", "2025-13-01", "2025-1-01", "9999-01-01", "yesterday"])("rejects impossible or future birth dates: %s", date => {
    expect(() => operationValues("children", data({ full_name: "طفل", date_of_birth: date }))).toThrow(ValidationError);
  });
  it("accepts a real leap-day date and clears an optional date explicitly", () => {
    expect(operationValues("children", data({ full_name: "طفل", date_of_birth: "2024-02-29" })).date_of_birth).toBe("2024-02-29");
    expect(operationValues("children", data({ full_name: "طفل", date_of_birth: "" })).date_of_birth).toBeNull();
  });
  it.each(["-1", "Infinity", "NaN", "1e5", "12.345", "10000000000", ""])("rejects invalid invoice amounts: %s", amount => {
    expect(() => operationValues("invoices", data({ amount_sar: amount, status: "draft" }))).toThrow(ValidationError);
  });
  it("accepts zero and maximum precision amounts with an optional guardian", () => {
    expect(operationValues("invoices", data({ amount_sar: "0", status: "draft" }))).toEqual({ amount_sar: 0, status: "draft", guardian_id: null });
    expect(operationValues("invoices", data({ amount_sar: "9999999999.99", status: "draft", guardian_id: child })).amount_sar).toBe(9999999999.99);
  });
  it("requires a valid child for enrollment and restricts status choices", () => {
    expect(() => operationValues("enrollments", data({ status: "approved" }))).toThrow(ValidationError);
    expect(() => operationValues("enrollments", data({ child_id: child, status: "paid" }))).toThrow(ValidationError);
    expect(operationValues("enrollments", data({ child_id: child, branch_id: branch, status: "approved" }))).toEqual({ child_id: child, branch_id: branch, status: "approved" });
  });
  it("validates optional guardian phones and organization types", () => {
    expect(() => operationValues("guardians", data({ full_name: "ولي أمر", phone: "bad number" }))).toThrow(ValidationError);
    expect(operationValues("guardians", data({ full_name: "ولي أمر", phone: "+966500000000" })).phone).toBe("+966500000000");
    expect(() => organizationValues(data({ name: "منشأة", type: "public_admin" }))).toThrow(ValidationError);
    expect(organizationValues(data({ name: " منشأة ", type: "school", id: child }))).toEqual({ name: "منشأة", type: "school" });
  });
  it("rejects non UUID identifiers", () => {
    for (const value of ["", "../../data", "null", null, new File(["x"], "id")]) expect(() => uuid(value)).toThrow(ValidationError);
  });
});
