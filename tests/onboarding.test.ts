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

import { guideRequest, pageTour, setupSuggestion } from "../lib/onboarding";

describe("guide requests to the assistant", () => {
  it.each([
    ["اشرح لي", "setup"], ["ابدأ الشرح", "setup"], ["كيف أبدأ؟", "setup"], ["كيف ابدا", "setup"], ["علمني", "setup"], ["جولة", "setup"],
    ["خذني جولة", "setup"], ["وش الخطوة الجاية؟", "setup"], ["ايش الخطوة التالية", "setup"], ["شغّل الشرح", "setup"], ["كمّل تجهيز مدرستك", "setup"],
    ["من وين أبدأ؟", "setup"], ["لو سمحت ابدأ الشرح", "setup"], ["كيف أشغّل الشرح؟", "setup"], ["وين وصلت في التجهيز", "setup"],
    ["اشرح لي هالصفحة", "page"], ["اشرح هذي الصفحة", "page"], ["وش هالصفحة؟", "page"], ["جولة في هالصفحة", "page"], ["ممكن تشرح لي هالصفحة", "page"],
    ["علمني هالصفحة", "page"], ["اشرحلي الصفحة الحالية", "page"],
  ])("«%s» → %s", (text, mode) => {
    expect(guideRequest(text)).toBe(mode);
  });
  it.each(["كيف أضيف موظف؟", "علمني كيف أسجل الحضور", "اشرح لي الحضور", "ابدأ يومي", "ملخص اليوم", "مين غايب اليوم؟", "سجّل ريم متأخرة", "الشرح الصحي للطالب سارة", ""])("«%s» is not a guide request", text => {
    expect(guideRequest(text)).toBeNull();
  });
  it("the first suggestion shows the setup's progress until it is complete", () => {
    expect(setupSuggestion({ track: "org", done: 4, total: 10, complete: false }, "school")).toBe("كمّل تجهيز مدرستك (٤ من ١٠)");
    expect(setupSuggestion({ track: "org", done: 4, total: 10, complete: false }, "kindergarten")).toBe("كمّل تجهيز روضتك (٤ من ١٠)");
    expect(setupSuggestion({ track: "staff", done: 2, total: 6, complete: false }, "school")).toBe("كمّل جولتك (٢ من ٦)");
    expect(setupSuggestion({ track: "org", done: 10, total: 10, complete: true }, "school")).toBeNull();
  });
  it("every main menu page has a short tour; other pages do not", () => {
    for (const link of navLinks) {
      const tour = pageTour(link.href);
      expect(tour?.title).toBe(link.label);
      expect(tour!.stops.length).toBeGreaterThanOrEqual(2);
      expect(tour!.stops[0].targets).toEqual([{ selector: "main h1" }]);
      for (const stop of tour!.stops) expect(stop.text.length).toBeLessThanOrEqual(205);
    }
    expect(pageTour("/dashboard/children")!.stops.map(stop => stop.title)).toEqual(["الطلاب", "البحث والتصفية", "ملف الطالب", "إضافة طالب", "استيراد من Excel"]);
    expect(pageTour("/dashboard/children/123")).toBeNull();
    expect(pageTour("/admin")).toBeNull();
  });
});

import { placeBubble } from "../lib/onboarding";
describe("where the bubble goes", () => {
  const screen = { width: 1366, height: 850 };
  const overlaps = (a: { top: number; left: number; width: number; height: number }, b: { top: number; left: number; width: number; height: number }) =>
    a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
  it("beside the element on the side with more room, never over it", () => {
    const target = { top: 100, left: 700, width: 640, height: 600 };
    const placed = placeBubble(target, { height: 220 }, screen, 600);
    expect(placed.side).toBe("left");
    expect(overlaps(target, { top: placed.top!, left: placed.left!, width: placed.width!, height: 220 })).toBe(false);
    expect(placeBubble({ ...target, left: 20 }, { height: 220 }, screen, 600).side).toBe("right");
  });
  it("below or above a full-width element, and pinned when it is taller than the screen", () => {
    expect(placeBubble({ top: 100, left: 10, width: 1340, height: 200 }, { height: 220 }, screen, 600).side).toBe("below");
    expect(placeBubble({ top: 560, left: 10, width: 1340, height: 200 }, { height: 220 }, screen, 600).side).toBe("above");
    const tall = placeBubble({ top: 70, left: 10, width: 1340, height: 1300 }, { height: 220 }, screen, 600);
    expect(tall).toEqual({ side: "dock", ring: { top: 70, left: 10, width: 1340, height: 600 - 14 - 70 } });
  });
  it("always pinned on a phone, with the ring cut above the card (or none if hidden under it)", () => {
    const phone = { width: 390, height: 844 };
    expect(placeBubble({ top: 70, left: 10, width: 370, height: 80 }, { height: 200 }, phone, 560)).toEqual({ side: "dock", ring: { top: 70, left: 10, width: 370, height: 80 } });
    expect(placeBubble({ top: 600, left: 10, width: 370, height: 80 }, { height: 200 }, phone, 560).ring).toBeNull();
  });
});
