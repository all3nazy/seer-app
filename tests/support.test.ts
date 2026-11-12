import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findGuide, guide, isHowTo, isProblem } from "../lib/bot-knowledge";
import { navLinks } from "../lib/navigation";
import { settingsTabFor } from "../lib/settings-tabs";
import { supportEmail, ticketPage } from "../lib/support";

describe("the assistant explains every section step by step", () => {
  it("has a guide with steps for every page in the menu", () => {
    for (const link of navLinks) {
      const entry = guide.find(item => item.href === link.href);
      expect(entry, link.href).toBeDefined();
      expect(entry!.steps?.length ?? 0, link.href).toBeGreaterThanOrEqual(2);
    }
  });
  it("every guide entry has steps", () => {
    for (const entry of guide) expect(entry.steps?.length ?? 0, entry.id).toBeGreaterThan(0);
  });
  it.each([["كيف أغير كلمة المرور؟", "password"], ["كيف أسجل الحضور", "attendance"], ["وين تذاكري مع الدعم", "support"], ["كيف اثبت التطبيق على الجوال", "install"], ["كيف أحسب الرواتب", "payroll"]])("«%s» → %s", (question, id) => {
    expect(findGuide(question)?.id).toBe(id);
    expect(isHowTo(question)).toBe(true);
  });
});

describe("problems offer «تكلّم مع فريق سِير»", () => {
  it.each(["عندي مشكلة في الحضور", "الحضور ما يحفظ", "الصفحة ما تفتح", "التطبيق علق", "ما قدرت أضيف طالب", "أبي أكلم الدعم"])("detects «%s»", text => expect(isProblem(text)).toBe(true));
  it.each(["كيف أسجل الحضور؟", "مين غايب اليوم؟", "ملخص اليوم", "كيف أضيف عطلة رسمية", "اعرض لي خطوات الحضور"])("does not treat «%s» as a problem", text => expect(isProblem(text)).toBe(false));
});

describe("tickets keep only the page path", () => {
  it("drops the query string and anything that is not a dashboard path", () => {
    expect(ticketPage("/dashboard/children/abc?org=x&q=ريم")).toBe("/dashboard/children/abc");
    expect(ticketPage("https://evil.test/x")).toBeNull();
    expect(ticketPage("/dashboard/../etc")).toBeNull();
    expect(ticketPage(null)).toBeNull();
  });
});

describe("no WhatsApp support left in the interface", () => {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
  it("nothing reads SEER_SUPPORT_WHATSAPP and public pages show the support email", () => {
    for (const file of [...walk("app"), ...walk("components"), ...walk("lib")].filter(path => /\.tsx?$/.test(path))) {
      expect(readFileSync(file, "utf8"), file).not.toContain("SEER_SUPPORT_WHATSAPP");
    }
    for (const file of ["app/signup/page.tsx", "app/pricing/page.tsx", "app/login/page.tsx"]) expect(readFileSync(file, "utf8"), file).toMatch(/supportEmail|supportMailto/);
    expect(supportEmail).toBe("seer-app@smail.sa");
  });
});

describe("settings tabs: short names and old anchors", () => {
  const all = ["account", "organization", "device", "help"] as const;
  it.each([["org", "organization"], ["sections", "organization"], ["notify", "device"], ["app", "device"], ["support", "help"], ["password", "account"]])("#%s → %s", (hash, tab) => {
    expect(settingsTabFor(hash, [...all])).toBe(tab);
  });
});
