import { describe, expect, it } from "vitest";
import { activityPill, auditLabel, dayCount, pageList, statusPill, timeAgo } from "../lib/admin-format";
import { listHref, PER_PAGE } from "../lib/admin-format";
import { effectiveSections } from "../lib/pilot";
import { featureKeys } from "../lib/subscriptions";
import { readFileSync } from "node:fs";

describe("«سِير أدمن» formatting", () => {
  const now = Date.parse("2026-11-22T09:00:00Z");
  it("relative times in Arabic", () => {
    expect(timeAgo("2026-11-22T08:59:40Z", now)).toBe("الآن");
    expect(timeAgo("2026-11-22T08:50:00Z", now)).toBe("قبل ١٠ دقائق");
    expect(timeAgo("2026-11-22T08:58:00Z", now)).toBe("قبل دقيقتين");
    expect(timeAgo("2026-11-22T08:00:00Z", now)).toBe("قبل ساعة");
    expect(timeAgo("2026-11-22T06:00:00Z", now)).toBe("قبل ٣ ساعات");
    expect(timeAgo("2026-11-21T09:00:00Z", now)).toBe("أمس");
    expect(timeAgo("2026-11-19T09:00:00Z", now)).toBe("قبل ٣ أيام");
    expect(timeAgo("2026-10-03T09:00:00Z", now)).toBe("٣ أكتوبر ٢٠٢٦");
  });
  it("day counts, status pills, audit labels, activity pills", () => {
    expect([1, 2, 5, 15].map(dayCount)).toEqual(["يوم", "يومين", "٥ أيام", "١٥ يوم"]);
    expect(statusPill("suspended", "locked")).toEqual({ label: "موقوف مؤقتًا", tone: "rose" });
    expect(statusPill("trial", "active").label).toBe("تجربة");
    expect(statusPill("active", "grace").label).toBe("في المهلة");
    expect(statusPill("active", "locked").label).toBe("مقفل");
    expect(auditLabel("org_cancelled")).toBe("إلغاء الاشتراك");
    expect(auditLabel("unknown_action")).toBe("unknown_action");
    expect(activityPill("join", "join_request").label).toBe("انضمام");
    expect(activityPill("audit", "login_unlocked").label).toBe("حماية");
  });
  it("every action the new database functions record has an Arabic label", () => {
    const sql = readFileSync("supabase/migrations/20261122090000_admin_stage2.sql", "utf8");
    const actions = [...sql.matchAll(/admin_log\(org, (?:case when suspended then )?'([a-z_]+)'(?: else '([a-z_]+)' end)?/g)].flatMap(match => [match[1], match[2]]).filter(Boolean) as string[];
    expect(actions.length).toBeGreaterThanOrEqual(10);
    for (const action of actions) expect(auditLabel(action), action).not.toBe(action);
  });
  it("pages: Arabic pager with gaps, filters kept in the links", () => {
    expect(pageList(1, 1)).toEqual([1]);
    expect(pageList(1, 5)).toEqual([1, 2, "…", 5]);
    expect(pageList(5, 10)).toEqual([1, "…", 4, 5, 6, "…", 10]);
    expect(pageList(10, 10)).toEqual([1, "…", 9, 10]);
    expect(PER_PAGE).toBe(25);
    const query = { q: "الياسمين", status: "active", plan: "", ending: true, sort: "name", page: 1 };
    expect(listHref(query, 2)).toBe("/admin/subscribers?q=%D8%A7%D9%84%D9%8A%D8%A7%D8%B3%D9%85%D9%8A%D9%86&status=active&ending=1&sort=name&page=2");
    expect(listHref({ q: "", status: "", plan: "", ending: false, sort: "ending", page: 1 }, 1)).toBe("/admin/subscribers");
  });
});

describe("entitlements on the subscriber side", () => {
  const basic = { features: ["daily", "tasks"], disabled: [] as string[] };
  it("a blocked section is hidden (switched off), not shown with a lock — with and without the pilot", () => {
    const normal = effectiveSections(basic, false, ["daily"]);
    expect(normal.features).toContain("daily");
    expect(normal.disabled).toContain("daily");
    const pilot = effectiveSections(basic, true, ["finance"]);
    expect(pilot.features).toEqual([...featureKeys]);
    expect(pilot.disabled).toContain("finance");
    expect(effectiveSections(basic, false)).toBe(basic);
  });
});
