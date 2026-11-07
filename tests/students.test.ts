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

describe("admissions validation", async () => {
  const { applicationPayload, reviewValues, riyadhLocalInput } = await import("../lib/admissions");
  const base = { child_name: "ريم", guardian_name: "أم ريم", guardian_phone: "050 000 0001", relationship: "mother", consent: "on" };
  it("normalises the public form and requires consent", () => {
    expect(applicationPayload(form(base))).toMatchObject({ child_name: "ريم", guardian_phone: "0500000001", relationship: "mother", grade_level_id: "" });
    expect(() => applicationPayload(form({ ...base, consent: "" }))).toThrow("وافق");
    expect(() => applicationPayload(form({ ...base, guardian_phone: "12" }))).toThrow();
    expect(() => applicationPayload(form({ ...base, relationship: "boss" }))).toThrow();
  });
  it("reads interview times as Riyadh time and refuses manual enrolment", () => {
    expect(reviewValues(form({ status: "interview", interview_at: "2026-11-10T09:30" }))).toMatchObject({ status: "interview", interview_at: "2026-11-10T06:30:00.000Z" });
    expect(riyadhLocalInput("2026-11-10T06:30:00.000Z")).toBe("2026-11-10T09:30");
    expect(() => reviewValues(form({ status: "enrolled" }))).toThrow();
  });
});

describe("finance validation", async () => {
  const { financeValues, lineValues, paymentValues, lineNet, balance, sar } = await import("../lib/finance");
  it("validates catalogue, plans and discounts", () => {
    expect(financeValues("fee_items", form({ name: "رسوم", kind: "tuition", default_amount: "12000", vat_rate: "15" }), false)).toEqual({ name: "رسوم", kind: "tuition", default_amount: 12000, vat_rate: 15, is_active: true });
    expect(() => financeValues("fee_items", form({ name: "رسوم", kind: "tuition", default_amount: "12,000", vat_rate: "15" }), false)).toThrow();
    expect(() => financeValues("fee_plans", form({ name: "x", installments: "13" }), false)).toThrow("الأقساط");
    expect(() => financeValues("discounts", form({ name: "x", reason: "sibling", kind: "percent", value: "120" }), false)).toThrow("١٠٠");
  });
  it("validates lines and payments", () => {
    expect(lineValues(form({ description: "كتب", kind: "books", quantity: "2", unit_price: "250", discount: "50", vat_rate: "15" }))).toMatchObject({ quantity: 2, unit_price: 250, discount: 50 });
    expect(() => lineValues(form({ description: "كتب", kind: "books", quantity: "1", unit_price: "10", discount: "20", vat_rate: "15" }))).toThrow("الخصم");
    expect(() => paymentValues(form({ amount: "0", method: "cash", paid_on: "2026-01-01" }))).toThrow();
    expect(() => paymentValues(form({ amount: "10", method: "bitcoin", paid_on: "2026-01-01" }))).toThrow();
    expect(lineNet({ quantity: 2, unit_price: 250, discount: 50 })).toBe(450);
    expect(balance({ amount_sar: 100.1, paid_total: 50.05 })).toBe(50.05);
    expect(sar(1234.5)).toContain("ر.س");
  });
});
