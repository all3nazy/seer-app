import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { adminNavFor } from "../lib/admin-nav";
import { roleAllows, rolesForPath } from "../lib/admin-roles";
import { audienceText, auditDetail, auditHref, auditQuery, auditRpcArgs, couponReason, couponScope, couponState, couponValue, parseCouponForm, toCsv } from "../lib/admin-stage3";
import { auditLabel } from "../lib/admin-format";
import { signInMessages } from "../lib/login-messages";

const form = (entries: [string, string][]) => { const data = new FormData(); entries.forEach(([key, value]) => data.append(key, value)); return data; };
const plan = "b1000000-0000-0000-0000-000000000001";

describe("roles in «سِير أدمن»", () => {
  it("the owner may do everything; support and finance only their pages", () => {
    expect(roleAllows("owner", [])).toBe(true);
    expect(roleAllows("support", rolesForPath("/admin/support/abc"))).toBe(true);
    expect(roleAllows("finance", rolesForPath("/admin/support"))).toBe(false);
    expect(roleAllows("finance", rolesForPath("/admin/invoices/123"))).toBe(true);
    expect(roleAllows("support", rolesForPath("/admin/subscribers/123"))).toBe(true);
    expect(roleAllows("support", rolesForPath("/admin/team"))).toBe(false);
    expect(roleAllows("finance", rolesForPath("/admin/audit"))).toBe(false);
  });
  it("the sidebar hides what a role cannot open (and empty groups)", () => {
    const hrefs = (role: "owner" | "support" | "finance") => adminNavFor(role).flatMap(group => group.items.map(item => item.href));
    expect(hrefs("support")).toEqual(["/admin", "/admin/subscribers", "/admin/support", "/admin/support/templates"]);
    expect(hrefs("finance")).toEqual(["/admin", "/admin/subscribers", "/admin/payments", "/admin/invoices", "/admin/coupons"]);
    expect(hrefs("owner")).toEqual(expect.arrayContaining(["/admin/coupons", "/admin/invoices", "/admin/broadcast", "/admin/security", "/admin/audit", "/admin/team"]));
    expect(adminNavFor("support").map(group => group.title)).toEqual([null, "المشتركين", "الدعم والتواصل"]);
    expect(hrefs("owner").some(href => href.includes("#"))).toBe(false);
  });
});

describe("coupons", () => {
  it("reads the form: uppercase code, plans and durations, limits, dates", () => {
    const parsed = parseCouponForm(form([["code", " ramadan20 "], ["kind", "percent"], ["value", "20"], ["plans", plan], ["months", "12"], ["months", "7"], ["valid_from", "2026-12-01"], ["valid_until", "2026-12-31"], ["max_uses", "50"], ["max_per_org", "1"], ["first_payment_only", "on"], ["note", "عرض"]]));
    expect(parsed).toEqual({ args: { p_id: null, p_code: "RAMADAN20", p_kind: "percent", p_value: 20, p_plans: [plan], p_months: [12], p_from: "2026-12-01", p_until: "2026-12-31", p_max_uses: 50, p_max_per_org: 1, p_first_only: true, p_note: "عرض", p_active: true } });
    expect(parseCouponForm(form([["code", "AB"], ["kind", "percent"], ["value", "10"]]))).toHaveProperty("error");
    expect(parseCouponForm(form([["code", "OK10"], ["kind", "percent"], ["value", "120"]]))).toEqual({ error: "النسبة من ١ إلى ١٠٠٪." });
    expect(parseCouponForm(form([["code", "OK10"], ["kind", "fixed"], ["value", "0"]]))).toHaveProperty("error");
    expect(parseCouponForm(form([["code", "OK10"], ["kind", "fixed"], ["value", "50"], ["valid_from", "2026-12-10"], ["valid_until", "2026-12-01"]]))).toEqual({ error: "تاريخ النهاية قبل البداية." });
    expect(parseCouponForm(form([["code", "OK10"], ["kind", "fixed"], ["value", "50"], ["max_uses", "1.5"]]))).toHaveProperty("error");
    expect(parseCouponForm(form([["code", "OK10"], ["kind", "fixed"], ["value", "50"], ["is_active", "off"]]))).toMatchObject({ args: { p_active: false, p_max_uses: null, p_plans: [], p_months: [] } });
  });
  it("describes value, scope, state and why a code did not apply", () => {
    expect(couponValue({ kind: "percent", value: 15 })).toBe("١٥٪");
    expect(couponValue({ kind: "fixed", value: 100 })).toBe("١٠٠ ر.س");
    expect(couponScope({ plan_ids: [], months: [], first_payment_only: false }, [])).toBe("كل الباقات · كل المدد · كل تجديد");
    expect(couponScope({ plan_ids: [plan], months: [12, 1], first_payment_only: true }, [{ id: plan, name: "المتقدمة" }])).toBe("المتقدمة · شهر، سنة · أول دفعة فقط");
    const base = { is_active: true, valid_from: null, valid_until: null, max_uses: null, used: 0, pending: 0 };
    expect(couponState(base, "2026-11-21").label).toBe("فعّال");
    expect(couponState({ ...base, is_active: false }, "2026-11-21").label).toBe("موقوف");
    expect(couponState({ ...base, valid_until: "2026-11-20" }, "2026-11-21").label).toBe("انتهى");
    expect(couponState({ ...base, valid_from: "2026-12-01" }, "2026-11-21").label).toBe("يبدأ لاحقًا");
    expect(couponState({ ...base, max_uses: 2, used: 1, pending: 1 }, "2026-11-21").label).toBe("اكتمل استخدامه");
    expect(couponReason("org_limit")).toBe("استخدمت منشأتك هذا الكود من قبل.");
    expect(couponReason("whatever")).toBe("تعذر تطبيق الكود.");
  });
});

describe("the operations log and its export", () => {
  it("keeps only valid filters and builds page links and database arguments", () => {
    const org = "e2000000-0000-0000-0000-0000000000e1";
    const query = auditQuery({ actor: "nope", action: "ip_blocked", org, from: "2026-11-01", to: "bad", page: "3" });
    expect(query).toEqual({ actor: "", action: "ip_blocked", org, from: "2026-11-01", to: "", page: 3 });
    expect(auditHref(query, 4)).toBe(`/admin/audit?action=ip_blocked&org=${org}&from=2026-11-01&page=4`);
    expect(auditHref(query, 1, "/admin/audit/export")).toBe(`/admin/audit/export?action=ip_blocked&org=${org}&from=2026-11-01`);
    expect(auditRpcArgs(query)).toEqual({ p_actor: null, p_action: "ip_blocked", p_org: org, p_from: "2026-11-01", p_to: null, p_page: 3, p_per: 50 });
    expect(auditQuery({ page: "-2" }).page).toBe(1);
  });
  it("shows the detail without ids, and Arabic labels for the new actions", () => {
    expect(auditDetail({ coupon: "x", code: "SPRING20", value: 20 })).toBe("code: SPRING20 · value: 20");
    expect(auditDetail(null)).toBe("");
    for (const action of ["coupon_created", "invoice_issued", "broadcast_sent", "ip_blocked", "ip_unblocked", "admin_invited", "admin_role_changed", "admin_removed", "audit_exported", "login_lock_released"]) {
      expect(auditLabel(action)).not.toBe(action);
    }
  });
  it("CSV: a BOM for Excel, quoted cells, and spreadsheet formulas neutralised", () => {
    const csv = toCsv([["الوقت", "التفاصيل"], ["١ نوفمبر", 'قال "نعم", وراح'], ["=HYPERLINK(\"x\")", null]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"قال ""نعم"", وراح"');
    expect(csv).toContain(`"'=HYPERLINK(""x"")",`);
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});

describe("broadcasts and the sign-in block", () => {
  it("describes the audience in the history", () => {
    expect(audienceText({ status: "trial", plan, orgs: [] }, true, [{ id: plan, name: "الأساسية" }])).toBe("تجربة · باقة الأساسية · الملاك والمدراء");
    expect(audienceText({}, false, [])).toBe("كل المشتركين · الملاك");
  });
  it("a blocked address gets its own message without detail", () => {
    expect(signInMessages.blocked).toContain("موقوف");
    expect(readFileSync("app/login/actions.ts", "utf8")).toContain('check.scope === "blocked" ? signInMessages.blocked');
  });
});

describe("the stage 3 migration", () => {
  const sql = readFileSync("supabase/migrations/20261123090000_admin_stage3.sql", "utf8");
  it("every new admin function checks the role first, and every change is logged", () => {
    const bodies = sql.split(/\ncreate (?:or replace )?function /).slice(1);
    const admin = bodies.filter(body => body.startsWith("private.admin_") && !body.startsWith("private.admin_team_guard"));
    expect(admin.length).toBeGreaterThan(15);
    for (const body of admin) expect(body.slice(0, 900), body.slice(0, 60)).toMatch(/perform private\.require_platform_admin\(array\[/);
    for (const name of ["admin_team_invite", "admin_team_set_role", "admin_team_remove", "admin_save_coupon", "admin_issue_invoice", "admin_broadcast_send", "admin_release_lock", "admin_block_ip", "admin_unblock_ip", "admin_audit_exported"]) {
      const body = bodies.find(item => item.startsWith(`private.${name}(`))!;
      expect(body, name).toContain("private.admin_log(");
    }
  });
  it("internal helpers are not callable by signed-in users", () => {
    const grants = sql.slice(sql.indexOf("-- Grants"));
    const toAuthenticated = grants.slice(grants.indexOf("grant execute on function private.require_platform_admin(text[])"), grants.indexOf("to authenticated;", grants.indexOf("grant execute on function private.require_platform_admin(text[])")));
    for (const helper of ["broadcast_targets", "coupon_quote(", "issue_payment_receipt", "next_platform_invoice_number", "ip_blocked_until", "admin_team_guard"]) expect(toAuthenticated, helper).not.toContain(helper);
  });
});
