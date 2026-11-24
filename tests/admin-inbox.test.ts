import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gmailThreadLink, inboxBatch, splitSender } from "../lib/inbox";
import { adminNavFor } from "../lib/admin-nav";
import { rolesForPath } from "../lib/admin-roles";

describe("admin inbox", () => {
  it("keeps only well-formed messages and trims long fields", () => {
    const batch = inboxBatch({ messages: [
      { gmail_id: "18c1a2b3", thread_id: "18c1a2b3", from_name: " حضانة ", from_email: "A@B.SA", subject: "مهتم", body: "x".repeat(60000), attachments: [{ name: "قائمة.xlsx", size: 2048 }], received_at: "2026-11-25T06:00:00.000Z" },
      { gmail_id: "bad id!", thread_id: "t", from_email: "a@b.sa" },
      { gmail_id: "1", thread_id: "1", from_email: "not-an-email" },
      null,
    ] })!;
    expect(batch).toHaveLength(1);
    expect(batch[0]).toMatchObject({ from_name: "حضانة", from_email: "a@b.sa", subject: "مهتم", attachments: [{ name: "قائمة.xlsx", size: 2048 }] });
    expect(batch[0].body).toHaveLength(50000);
    expect(inboxBatch({ messages: new Array(51).fill({}) })).toBeNull();
    expect(inboxBatch("nope")).toBeNull();
  });
  it("splits Gmail senders and links to the thread in the Seer account", () => {
    expect(splitSender('"مركز تكوين" <Takween.Nursery@gmail.com>')).toEqual({ name: "مركز تكوين", email: "takween.nursery@gmail.com" });
    expect(splitSender("a@b.sa")).toEqual({ name: null, email: "a@b.sa" });
    expect(gmailThreadLink("18c1a2b3")).toBe("https://mail.google.com/mail/?authuser=iseer.app%40gmail.com#all/18c1a2b3");
    expect(gmailThreadLink("x\"><script>")).not.toContain("<script>");
  });
  it("is in the sidebar for the owner and support, not finance", () => {
    expect(rolesForPath("/admin/inbox/abc")).toEqual(["support"]);
    const has = (role: "owner" | "support" | "finance") => adminNavFor(role).some(group => group.items.some(item => item.href === "/admin/inbox"));
    expect([has("owner"), has("support"), has("finance")]).toEqual([true, true, false]);
  });
  it("the route needs the secret and the migration keeps ingest to the service role", () => {
    const route = readFileSync("app/api/inbox/ingest/route.ts", "utf8");
    expect(route).toContain("sameSecret(request.headers.get(\"authorization\") ?? \"\", `Bearer ${secret}`)");
    expect(route).toContain("secret.length < 32");
    const sql = readFileSync("supabase/migrations/20261125090000_admin_inbox.sql", "utf8");
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toMatch(/grant execute on function private\.inbox_ingest\(jsonb\), public\.inbox_ingest\(jsonb\) to service_role;/);
    expect(sql).not.toMatch(/inbox_ingest\(jsonb\)[^;]*to authenticated/);
  });
});
