import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { barLabel, currentStep, guideFor, helpSubject, isStepKey, onStepPage, setupPercent, stepGuides, stepHelpLink, stepTitle, welcomeTitle } from "../lib/onboarding";
import { navLinks } from "../lib/navigation";

describe("guided setup steps", () => {
  it("every step the database can return has a page, a target and a short explanation", () => {
    const sql = readFileSync("supabase/migrations/20261117090000_onboarding.sql", "utf8");
    const keys = [...sql.matchAll(/step := '([a-z]+)'/g)].map(match => match[1]);
    expect(new Set(keys)).toEqual(new Set(["profile", "device", "sections", "classes", "students", "guardians", "team", "attendance", "daily", "portal", "my", "support"]));
    const pages = new Set([...navLinks.map(link => link.href), "/dashboard/support"]);
    for (const key of keys) {
      expect(isStepKey(key)).toBe(true);
      const guide = stepGuides[key as keyof typeof stepGuides];
      expect(pages.has(guide.path.split("#")[0])).toBe(true);
      expect(guide.targets.length).toBeGreaterThan(0);
      expect(guide.text.length).toBeLessThan(160);
    }
  });
  it("steps the member marks have a button, the others finish from the data", () => {
    const sql = readFileSync("supabase/migrations/20261117090000_onboarding.sql", "utf8");
    expect(sql).toContain("step in ('device','sections')");
    expect(sql).toContain("step in ('device','attendance','daily','my','support')");
    for (const key of ["device", "sections", "my", "support"] as const) expect(stepGuides[key].mark).toBeTruthy();
    for (const key of ["attendance", "daily"] as const) expect(guideFor(key, "staff").mark).toBeTruthy();
    expect(guideFor("attendance", "org").mark).toBeUndefined();
  });
  it("knows where each step happens (a student's file counts for guardians and portal links)", () => {
    expect(onStepPage("students", "/dashboard/children")).toBe(true);
    expect(onStepPage("guardians", "/dashboard/children/abc")).toBe(true);
    expect(onStepPage("students", "/dashboard/children/abc")).toBe(false);
    expect(onStepPage("profile", "/dashboard/settings")).toBe(true);
    expect(onStepPage("team", "/dashboard")).toBe(false);
  });
  it("texts, the current step, help and percentages", () => {
    expect(welcomeTitle("org", "school")).toBe("خلونا نجهّز مدرستكم");
    expect(welcomeTitle("org", "nursery")).toBe("خلونا نجهّز حضانتكم");
    expect(barLabel("org", "kindergarten")).toBe("تجهيز روضتك");
    expect(barLabel("staff", "school")).toBe("جولتك في سِير");
    expect(currentStep({ steps: [{ step: "profile", done: true, markable: false }, { step: "device", done: false, markable: true }] })?.step).toBe("device");
    expect(currentStep({ steps: [{ step: "profile", done: true, markable: false }] })).toBeNull();
    expect(stepHelpLink("team")).toBe("/dashboard/support/new?from=%2Fdashboard%2Fteam&step=team");
    expect(helpSubject("team")).toBe("مساعدة في خطوة: دعوة الفريق");
    expect(isStepKey("toString")).toBe(false);
    expect(setupPercent({ done: 4, total: 10 })).toBe(40);
    expect(setupPercent({ done: 0, total: 0 })).toBe(0);
    expect(stepTitle("portal")).toBe("روابط البوابة للأهالي");
  });
});
