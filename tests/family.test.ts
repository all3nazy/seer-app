import { describe, expect, it } from "vitest";
import { napLabel, portalMessage, reportSummary } from "../lib/family";

describe("family helpers", () => {
  it("describes nap length in Arabic", () => {
    expect(napLabel(0)).toBe("ما نام");
    expect(napLabel(90)).toBe("١ ساعة و٣٠ دقيقة");
    expect(napLabel(null)).toBeNull();
  });
  it("summarises a child's day for WhatsApp, skipping empty parts", () => {
    const text = reportSummary("ريم", { mood: "happy", breakfast: "all", lunch: "some", nap_minutes: 45, incident: "خدش بسيط في الركبة" });
    expect(text).toContain("يوم ريم اليوم:");
    expect(text).toContain("😄 سعيد");
    expect(text).toContain("الفطور كامل، الغداء بعضه");
    expect(text).toContain("٤٥ دقيقة");
    expect(text).toContain("ملاحظة مهمة: خدش بسيط في الركبة");
    expect(text).not.toContain("الدواء");
  });
  it("writes a portal invitation with the link", () => {
    expect(portalMessage("حضانة كرز", "أم ريم", "https://x/p/t")).toContain("https://x/p/t");
  });
});
