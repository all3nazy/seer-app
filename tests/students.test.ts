import { describe, expect, it } from "vitest";
import { age, attendanceEntries, healthValues, profileValues, riyadhToday } from "../lib/students";
import { auditFilters, riyadhDayStart, toCsv } from "../lib/audit";

const child = "30000000-0000-0000-0000-000000000001";
const form = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; };

describe("student file validation", () => {
  it("accepts a complete profile and normalises empty optional fields to null", () => {
    expect(profileValues(form({ full_name: "  سارة  ", date_of_birth: "2020-01-15", gender: "female", national_id: "1234567890", branch_id: "", notes: "" })))
      .toEqual({ full_name: "سارة", date_of_birth: "2020-01-15", gender: "female", national_id: "1234567890", branch_id: null, section_id: null, photo_consent: false, notes: null });
  });
  it("rejects bad identity numbers, future birthdays and unknown genders", () => {
    expect(() => profileValues(form({ full_name: "سارة", national_id: "12345" }))).toThrow("١٠ أرقام");
    expect(() => profileValues(form({ full_name: "سارة", date_of_birth: "2999-01-01" }))).toThrow();
    expect(() => profileValues(form({ full_name: "سارة", gender: "x" }))).toThrow();
    expect(() => profileValues(form({ full_name: "" }))).toThrow();
  });
  it("validates health fields", () => {
    expect(healthValues(form({ blood_type: "O+", allergies: "بيض", emergency_phone: "+966500000000" }))).toMatchObject({ blood_type: "O+", allergies: "بيض", emergency_phone: "+966500000000", medications: null });
    expect(() => healthValues(form({ blood_type: "Z" }))).toThrow();
    expect(() => healthValues(form({ emergency_phone: "abc" }))).toThrow();
  });
  it("reads an attendance sheet, skipping unmarked students", () => {
    const other = "30000000-0000-0000-0000-000000000002";
    expect(attendanceEntries(form({ [`status:${child}`]: "late", [`note:${child}`]: " زحمة ", [`status:${other}`]: "" })))
      .toEqual([{ child_id: child, status: "late", note: "زحمة" }]);
    expect(() => attendanceEntries(form({ [`status:${child}`]: "asleep" }))).toThrow();
    expect(() => attendanceEntries(form({ "status:not-a-uuid": "present" }))).toThrow();
  });
  it("computes Riyadh's day and a readable age", () => {
    expect(riyadhToday(new Date("2026-11-07T22:30:00Z"))).toBe("2026-11-08");
    expect(age("2024-05-10", "2026-11-08")).toBe("٢ سنة و٥ شهر");
    expect(age("2026-09-01", "2026-11-08")).toBe("٢ شهر");
    expect(age(null)).toBeNull();
  });
});

describe("audit log helpers", () => {
  it("keeps only known filters", () => {
    expect(auditFilters({ entity: "attendance", action: "DROP", actor: "x", from: "2026-11-01", to: "bad" })).toEqual({ entity: "attendance", action: undefined, actor: undefined, from: "2026-11-01", to: undefined });
  });
  it("starts a Riyadh day at 21:00 UTC the evening before", () => {
    expect(riyadhDayStart("2026-11-08")).toBe("2026-11-07T21:00:00.000Z");
  });
  it("escapes CSV cells and neutralises formulas", () => {
    expect(toCsv([["a,b", '"q"', "=SUM(A1)", null]])).toBe('﻿"a,b","""q""",\'=SUM(A1),\r\n');
  });
});

describe("academic structure validation", async () => {
  const { academicValues, holidayOn, sectionLabel } = await import("../lib/academics");
  it("validates years, holidays and sections", () => {
    expect(academicValues("academic_years", form({ name: "1448", starts_on: "2026-08-23", ends_on: "2027-06-20", is_current: "on" }), false)).toEqual({ name: "1448", starts_on: "2026-08-23", ends_on: "2027-06-20", is_current: true });
    expect(() => academicValues("academic_years", form({ name: "x", starts_on: "2026-08-23", ends_on: "2026-08-23" }), false)).toThrow();
    expect(academicValues("holidays", form({ name: "اليوم الوطني", starts_on: "2026-09-23", ends_on: "2026-09-23" }), false)).toMatchObject({ starts_on: "2026-09-23" });
    expect(() => academicValues("sections", form({ name: "أ", grade_level_id: child, gender: "boys", capacity: "500" }), false)).toThrow("السعة");
    expect(academicValues("section_staff", form({ duty: " معلمة " }), true)).toEqual({ duty: "معلمة" });
  });
  it("finds holidays and labels sections", () => {
    expect(holidayOn("2026-09-23", [{ name: "اليوم الوطني", starts_on: "2026-09-23", ends_on: "2026-09-23" }])).toBe("اليوم الوطني");
    expect(holidayOn("2026-09-24", [{ name: "اليوم الوطني", starts_on: "2026-09-23", ends_on: "2026-09-23" }])).toBeNull();
    expect(sectionLabel({ name: "أ", grade_level_id: "g" }, [{ id: "g", name: "الأول" }])).toBe("الأول — أ");
  });
});
