import { describe, expect, it } from "vitest";
import { ageing, attendanceBySection, monthRange, staffSummary } from "../lib/reports";

describe("management reports", () => {
  it("attendance rate per class counts late as attended", () => {
    const rows = attendanceBySection([{ section_id: "a", status: "present", total: 8 }, { section_id: "a", status: "late", total: 1 }, { section_id: "a", status: "absent", total: 1 }], new Map([["a", 10], ["b", 5]]));
    expect(rows.find(row => row.section === "a")).toMatchObject({ students: 10, recorded: 10, rate: 90 });
    expect(rows.find(row => row.section === "b")).toMatchObject({ students: 5, recorded: 0, rate: null });
  });
  it("ages outstanding balances by days late", () => {
    expect(ageing([{ amount_sar: 1000, paid_total: 400, due_date: "2026-11-01" }, { amount_sar: 500, paid_total: 0, due_date: "2026-08-01" }, { amount_sar: 300, paid_total: 0, due_date: "2026-12-01" }, { amount_sar: 200, paid_total: 200, due_date: "2026-01-01" }], "2026-11-08"))
      .toEqual({ total: 1400, notDue: 300, d30: 600, d60: 0, d90: 0, older: 500 });
  });
  it("summarises staff days and month bounds", () => {
    expect(staffSummary([{ staff_id: "s", status: "present" }, { staff_id: "s", status: "late" }, { staff_id: "s", status: "leave" }]).get("s")).toEqual({ present: 1, late: 1, absent: 0, leave: 1 });
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});
