import { describe, expect, it } from "vitest";
import { findGuide, isHowTo } from "../lib/bot-knowledge";
import { dueDate, nameSearchPattern, parseCommand, rankMatches } from "../lib/bot-commands";
import { stageTips, tipOfDay } from "../lib/stage";

describe("bot commands", () => {
  it.each([
    ["سجّل ريم حاضرة", { kind: "attendance", name: "ريم", status: "present" }],
    ["ريم خالد متأخرة", { kind: "attendance", name: "ريم خالد", status: "late" }],
    ["غياب سارة اليوم", { kind: "attendance", name: "ساره", status: "absent" }],
    ["نورة مستأذنة", { kind: "attendance", name: "نوره", status: "excused" }],
    ["وصل فهد", { kind: "attendance", name: "فهد", status: "present" }],
    ["مين غايب اليوم؟", { kind: "today", status: "absent" }],
    ["مين متأخر", { kind: "today", status: "late" }],
    ["كم غائب؟", { kind: "today", status: "absent" }],
    ["مين ما تسجل حضوره", { kind: "today", status: "pending" }],
    ["الحضور اليوم", { kind: "today", status: null }],
    ["ابحث عن ريم", { kind: "find", name: "ريم" }],
    ["وين الطالبة سارة", { kind: "find", name: "ساره" }],
    ["سلّم ريم لأمها", { kind: "pickup", name: "ريم" }],
    ["افتح فصل ٣/أ", { kind: "openClass", name: "٣/ا" }],
    ["الفصول الآن", { kind: "openClass", name: null }],
    ["نصيحة اليوم", { kind: "tip" }],
    ["طقس اليوم", null],
    ["كم مهمة متأخرة؟", null],
  ])("%s", (input, expected) => {
    expect(parseCommand(input)).toEqual(expected);
  });
  it("keeps the person's wording for task titles and reads the due day", () => {
    expect(parseCommand("أنشئ مهمة: تجهيز قاعة الحفل بكرة")).toEqual({ kind: "task", title: "تجهيز قاعة الحفل", due: "tomorrow" });
    expect(parseCommand("ذكرني أتصل بولي أمر سارة اليوم")).toEqual({ kind: "task", title: "أتصل بولي أمر سارة", due: "today" });
    expect(parseCommand("اضف مهمة جديدة طباعة الشهادات")).toEqual({ kind: "task", title: "طباعة الشهادات", due: null });
    expect(parseCommand("أنشئ مهمة")).toEqual({ kind: "task", title: "", due: null });
  });
  it("searches names across spelling variants without letting wildcards through", () => {
    expect(nameSearchPattern("نورة أحمد")).toBe("%نور_%_حمد%");
    expect(nameSearchPattern("50%_x")).toBe("%50x%");
  });
  it("ranks exact and prefix matches first", () => {
    const rows = [{ full_name: "سارة ريم" }, { full_name: "ريماس" }, { full_name: "ريم" }];
    expect(rankMatches("ريم", rows).map(row => row.full_name)).toEqual(["ريم", "ريماس", "سارة ريم"]);
  });
  it("computes due dates", () => {
    expect(dueDate("tomorrow", "2026-11-30")).toBe("2026-12-01");
    expect(dueDate("today", "2026-11-30")).toBe("2026-11-30");
    expect(dueDate(null, "2026-11-30")).toBeNull();
  });
  it("gives each stage a daily tip", () => {
    for (const stage of ["nursery", "kindergarten", "school"] as const) expect(stageTips[stage]).toContain(tipOfDay(stage));
  });
});

describe("platform guide", () => {
  it.each([
    ["كيف أضيف موظف؟", "team"],
    ["وين ألقى رابط التسجيل", "admissions"],
    ["كيف أسجل الحضور", "attendance"],
    ["كيف أسلّم الطالب لولي أمره؟", "pickup"],
    ["وش فايدة سجل التدقيق", "audit"],
    ["كيف أغير رقم جوالي", "settings"],
    ["ليش ما يظهر قسم المالية في الجوال", "phone"],
    ["كيف أضيف فصل جديد", "academics"],
    ["كيف أسند مهمة لمعلمة", "tasks"],
  ])("%s → %s", (question, id) => {
    expect(findGuide(question)?.id).toBe(id);
    expect(isHowTo(question) || question.startsWith("ليش")).toBe(true);
  });
  it("finds nothing for unrelated questions", () => {
    expect(findGuide("طقس الرياض")).toBeNull();
  });
});
