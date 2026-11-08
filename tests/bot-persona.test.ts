import { describe, expect, it } from "vitest";
import { briefingItems, briefingText, dayGreeting, detectMood, empathyLead, notUnderstood, smallTalk, stripCourtesy, type Briefing } from "../lib/bot-persona";
import { parseCommand } from "../lib/bot-commands";
import { botPersonas } from "../lib/stage";

const persona = botPersonas.school;
const empty: Briefing = { manager: true, attendance: null, tasks: null, applications: null, leave: null, inquiries: null, invoices: null, messages: null, dailyReports: null, trips: null };

describe("bot persona", () => {
  it("reads the tone of a message", () => {
    expect(detectMood("النظام ما يشتغل!!")).toBe("frustrated");
    expect(detectMood("ضروري الحين")).toBe("urgent");
    expect(detectMood("يعطيك العافية")).toBe("thanks");
    expect(detectMood("مين غايب اليوم؟")).toBe("neutral");
    expect(empathyLead("frustrated")).toContain("خطوة خطوة");
    expect(empathyLead("neutral")).toBe("");
  });
  it("answers courtesy warmly and leaves requests alone", () => {
    expect(smallTalk("السلام عليكم", persona, 9)).toMatch(/^وعليكم السلام/);
    expect(smallTalk("شكرًا", persona, 9)).toContain("العفو");
    expect(smallTalk("مين انت؟", persona, 9)).toContain("نجيب");
    expect(smallTalk("مين غايب اليوم؟", persona, 9)).toBeNull();
    expect(smallTalk("سجل ريم حاضرة", persona, 9)).toBeNull();
  });
  it("strips greetings so the request still runs", () => {
    expect(stripCourtesy("السلام عليكم، مين غايب اليوم؟")).toBe("مين غايب اليوم");
    expect(parseCommand(stripCourtesy("لو سمحت يا نجيب سجل ريم متأخرة"))).toEqual({ kind: "attendance", name: "ريم", status: "late" });
    expect(stripCourtesy("صباح الخير")).toBe("");
  });
  it("greets by the time of day", () => {
    expect(dayGreeting(8)).toBe("صباح الخير");
    expect(dayGreeting(14)).toBe("يسعد ظهرك");
    expect(dayGreeting(21)).toBe("مساء الخير");
  });
  it("recognises briefing requests", () => {
    for (const q of ["ملخص اليوم", "وش الوضع؟", "وش عندي اليوم", "طمني", "ابدأ يومي"]) expect(parseCommand(q)).toEqual({ kind: "brief" });
    expect(parseCommand("ملخص الحضور")).toEqual({ kind: "today", status: null });
  });
  it("orders the briefing by urgency and skips what is missing", () => {
    const items = briefingItems({ ...empty, attendance: { present: 20, late: 2, absent: 1, excused: 0, pending: 3, total: 26 }, tasks: { overdue: 2, dueToday: 1, mine: 0 }, leave: 1, invoices: { overdue: 2, overdueAmount: 1500 }, messages: { queued: 0, failed: 1 } });
    expect(items[0].tone).toBe("alert");
    expect(items.map(item => item.label)).toEqual(expect.arrayContaining(["المهام", "الموظفين", "المالية", "الرسائل", "الحضور"]));
    expect(items.findIndex(item => item.tone === "warn")).toBeGreaterThan(items.findLastIndex(item => item.tone === "alert"));
    expect(briefingText(items, 9)).toContain("أقترح نبدأ");
  });
  it("celebrates a calm day", () => {
    const items = briefingItems({ ...empty, attendance: { present: 10, late: 0, absent: 0, excused: 0, pending: 0, total: 10 } });
    expect(items).toHaveLength(1);
    expect(briefingText(items, 9)).toContain("تحت السيطرة");
  });
  it("never leaves the person at a dead end", () => {
    expect(notUnderstood("ابغى شي غريب", persona)).toContain("ملخص اليوم");
    expect(notUnderstood("ما يشتغل!!", persona)).toMatch(/^آسف/);
  });
});
