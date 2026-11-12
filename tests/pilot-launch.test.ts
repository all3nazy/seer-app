import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { effectiveSections, pilotHides, pilotMode } from "../lib/pilot";
import { featureKeys, featureState } from "../lib/subscriptions";
import { settingsTabFor } from "../lib/settings-tabs";
import { defaultOpenGroups, groupIsOpen } from "../lib/navigation";
import { LEGAL_VERSION, privacy, processingNotice, terms } from "../lib/legal";

describe("no second page refresh after a server action", () => {
  // A server action that revalidates already returns the refreshed page; calling router.refresh()
  // after it renders the whole page again (every query twice). Refreshing after a browser-side
  // Supabase call or a realtime event is fine.
  const actionNames = new Set<string>();
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
  for (const file of walk("app").filter(path => /\.tsx?$/.test(path))) {
    const source = readFileSync(file, "utf8");
    if (!/^["']use server["'];?/m.test(source)) continue;
    for (const match of source.matchAll(/export async function (\w+)/g)) actionNames.add(match[1]);
  }
  it("finds the server actions", () => { expect(actionNames.size).toBeGreaterThan(30); });
  for (const file of readdirSync("components").filter(name => name.endsWith(".tsx"))) {
    it(`components/${file}`, () => {
      const lines = readFileSync(`components/${file}`, "utf8").split("\n");
      const offenders = lines.flatMap((line, index) => {
        if (!line.includes("router.refresh()")) return [];
        // Look back within the same component only (up to 8 lines).
        let start = index;
        while (start > 0 && index - start < 8 && !/^(export )?(async )?function /.test(lines[start])) start--;
        const before = lines.slice(start, index + 1).join("\n");
        const called = [...before.matchAll(/await (\w+)\(/g)].map(match => match[1]).filter(name => actionNames.has(name));
        return called.length ? [`line ${index + 1}: router.refresh() after ${called.join(", ")}`] : [];
      });
      expect(offenders).toEqual([]);
    });
  }
});

describe("pilot mode", () => {
  it("is on only when SEER_PILOT_MODE is exactly 1", () => {
    expect(pilotMode({ SEER_PILOT_MODE: "1" })).toBe(true);
    for (const value of [undefined, "", "0", "true", "yes"]) expect(pilotMode({ SEER_PILOT_MODE: value })).toBe(false);
  });
  it("opens every section to every organization except parents' online payment", () => {
    const basic = { features: ["pickup", "daily"], disabled: ["daily"] };
    const sections = effectiveSections(basic, true);
    for (const key of featureKeys) expect(featureState(key, sections), key).not.toBe("locked");
    expect(featureState("transport", sections)).toBe("on");
    expect(featureState("daily", sections)).toBe("off"); // what the school turned off stays off
    expect(featureState("online_payments", sections)).toBe("off");
    expect(pilotHides("online_payments")).toBe(true);
  });
  it("changes nothing when off", () => {
    const basic = { features: ["pickup"], disabled: [] };
    expect(effectiveSections(basic, false)).toBe(basic);
    expect(featureState("transport", effectiveSections(basic, false))).toBe("locked");
  });
  it("is read by every page it changes", () => {
    for (const file of ["app/signup/page.tsx", "app/pricing/page.tsx", "app/dashboard/billing/page.tsx", "app/dashboard/layout.tsx", "app/dashboard/finance/online/page.tsx", "app/dashboard/finance/page.tsx", "app/d/[token]/page.tsx", "app/pay/[intent]/page.tsx", "app/pay/actions.ts", "app/auth/callback/route.ts", "app/dashboard/settings/page.tsx"]) {
      expect(readFileSync(file, "utf8"), file).toMatch(/pilotMode\(\)/);
    }
  });
});

describe("settings tabs, sidebar groups and legal texts", () => {
  it("opens the tab of the hash, including the old anchors", () => {
    const all = ["account", "organization", "device", "help"] as const;
    expect(settingsTabFor("device", [...all])).toBe("device");
    expect(settingsTabFor("notify", [...all])).toBe("device");
    expect(settingsTabFor("sections", [...all])).toBe("organization");
    expect(settingsTabFor("sections", ["account", "device", "help"])).toBe("account"); // staff: no organization tab
    expect(settingsTabFor("", [...all])).toBe("account");
  });
  it("folds sidebar groups: «اليوم» open first, the current group always open, the rail shows all", () => {
    expect(defaultOpenGroups).toEqual({ today: true, students: false, admin: false });
    expect(groupIsOpen("admin", null, null, false)).toBe(false);
    expect(groupIsOpen("admin", null, "admin", false)).toBe(true);
    expect(groupIsOpen("today", { today: false }, null, false)).toBe(false);
    expect(groupIsOpen("today", { today: false }, "today", false)).toBe(true);
    expect(groupIsOpen("students", { students: false }, null, true)).toBe(true);
  });
  it("has the legal texts with a version", () => {
    expect(LEGAL_VERSION).toMatch(/^[0-9A-Za-z.-]{1,40}$/);
    const text = JSON.stringify([privacy, terms]);
    for (const needle of ["FL-478894500", "seer-app@smail.sa", "مومباي", "٩٠ يومًا", "٣٠ يومًا", "محاكم مدينة الرياض", "اتفاقية معالجة البيانات", "تقنيات", "واتساب للأعمال"]) expect(text, needle).toContain(needle);
    expect(processingNotice).toBe("تُعالج بياناتك لصالح المدرسة لتقديم خدماتها، وفق سياسة الخصوصية");
  });
});

describe("in-app confirmation", async () => {
  const { isDangerous } = await import("../lib/confirm");
  it("makes the button red for delete, remove, stop and cancel", () => {
    for (const message of ["حذف الإعلان؟", "إزالة الطالب من المسار؟", "إيقاف اشتراك هذه المنشأة؟", "إلغاء ربط ريم؟"]) expect(isDangerous(message), message).toBe(true);
    for (const message of ["اعتماد التحويل وتفعيل الاشتراك؟", "إصدار الفاتورة؟"]) expect(isDangerous(message), message).toBe(false);
  });
  it("no browser confirm() is left", () => {
    for (const file of readdirSync("components").filter(name => name.endsWith(".tsx") && name !== "confirm.tsx")) {
      expect(readFileSync(`components/${file}`, "utf8"), file).not.toMatch(/window\.confirm\(/);
    }
  });
});
