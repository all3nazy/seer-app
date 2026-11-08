import { describe, expect, it } from "vitest";
import { contractDaysLeft, leaveValues, monthlyPay, payrollCsvRows, staffValues } from "../lib/hr";

const form = (values: Record<string, string>) => { const data = new FormData(); for (const [k, v] of Object.entries(values)) data.set(k, v); return data; };
describe("HR helpers", () => {
  it("validates an employee file and normalises Arabic digits", () => {
    const values = staffValues(form({ full_name: " منى ", national_id: "١٠٢٣٤٥٦٧٨٩", basic_salary: "٦٠٠٠", housing_allowance: "1500.50", iban: "sa03 8000 0000 6080 1016 7519", gosi_rate: "9.75" }));
    expect(values).toMatchObject({ full_name: "منى", national_id: "1023456789", basic_salary: 6000, housing_allowance: 1500.5, iban: "SA0380000000608010167519", gosi_rate: 9.75, status: "active", user_id: null });
    expect(() => staffValues(form({ full_name: "x", national_id: "3000000000" }))).toThrow("الهوية");
    expect(() => staffValues(form({ full_name: "x", hire_date: "2026-05-01", contract_end: "2026-01-01" }))).toThrow("نهاية العقد");
  });
  it("checks leave dates", () => {
    expect(leaveValues(form({ kind: "sick", starts_on: "2026-01-05" }))).toMatchObject({ starts_on: "2026-01-05", ends_on: "2026-01-05" });
    expect(() => leaveValues(form({ kind: "sick", starts_on: "2026-01-05", ends_on: "2026-01-01" }))).toThrow();
    expect(() => leaveValues(form({ kind: "holiday", starts_on: "2026-01-05" }))).toThrow("نوع");
  });
  it("adds pay, counts contract days and builds the bank sheet", () => {
    expect(monthlyPay({ basic_salary: 6000, housing_allowance: 1500, transport_allowance: 500, other_allowance: 0 })).toBe(8000);
    expect(contractDaysLeft("2026-12-01", "2026-11-01")).toBe(30);
    expect(payrollCsvRows([{ full_name: "منى", iban: null, net: 6735.4 }])[1]).toEqual(["منى", "", "6735.40"]);
  });
});
