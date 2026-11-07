import { describe, expect, it } from "vitest";
import { displayName, invitationMessage, inviteValues, memberName, relationshipValue } from "../lib/team";
import { taskValues } from "../lib/tasks";

const form = (entries: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(entries)) data.set(key, value); return data; };

describe("team input validation", () => {
  it("normalizes invitation emails and accepts only manager-grantable roles", () => {
    expect(inviteValues(form({ email: "  Noura@School.SA ", role: "staff", display_name: " نورة " }))).toEqual({ email: "noura@school.sa", role: "staff", name: "نورة" });
    expect(() => inviteValues(form({ email: "noura@school.sa", role: "owner" }))).toThrow("المدير أو الموظف");
    expect(() => inviteValues(form({ email: "not-an-email", role: "staff" }))).toThrow("بريدًا");
  });
  it("limits names and requires one only where asked", () => {
    expect(displayName(form({ n: "   " }).get("n"))).toBeNull();
    expect(() => displayName(null, true)).toThrow("اكتب الاسم");
    expect(() => displayName("ا".repeat(81))).toThrow("٨٠");
  });
  it("labels members without exposing anything but their chosen name", () => {
    expect(memberName({ display_name: null, role: "staff" })).toBe("موظف بدون اسم");
    expect(memberName({ display_name: "سارة", role: "admin" }, true)).toBe("سارة (أنت)");
    expect(memberName(undefined)).toBe("عضو سابق");
  });
  it("accepts only known family relationships", () => {
    expect(relationshipValue("mother")).toBe("mother");
    expect(() => relationshipValue("neighbour")).toThrow("صلة القرابة");
  });
  it("builds a share message with no email, token or personal data", () => {
    const message = invitationMessage("https://seer.example", "روضة الندى");
    expect(message).toContain("https://seer.example/auth/activate");
    expect(message).not.toMatch(/token|@/);
  });
});

describe("task assignee values", () => {
  it("leaves the assignee untouched when the field is absent and clears it when empty", () => {
    expect(taskValues(form({ title: "مهمة" }))).not.toHaveProperty("assignee_id");
    expect(taskValues(form({ title: "مهمة", assignee_id: "" })).assignee_id).toBeNull();
    expect(taskValues(form({ title: "مهمة", assignee_id: "10000000-0000-0000-0000-000000000001" })).assignee_id).toBe("10000000-0000-0000-0000-000000000001");
    expect(() => taskValues(form({ title: "مهمة", assignee_id: "x" }))).toThrow();
  });
});
