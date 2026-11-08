/**
 * Management report figures, computed from plain rows so they are easy to test: attendance rates
 * per class, collection and overdue ageing, and staff attendance for a month.
 */
export type SectionDay = { section_id: string | null; status: string; total: number };
export function attendanceBySection(rows: SectionDay[], enrolled: Map<string | null, number>) {
  const per = new Map<string | null, { present: number; late: number; absent: number; excused: number }>();
  for (const row of rows) {
    const item = per.get(row.section_id) ?? { present: 0, late: 0, absent: 0, excused: 0 };
    if (row.status in item) item[row.status as keyof typeof item] += Number(row.total);
    per.set(row.section_id, item);
  }
  return [...new Set([...enrolled.keys(), ...per.keys()])].map(section => {
    const c = per.get(section) ?? { present: 0, late: 0, absent: 0, excused: 0 };
    const recorded = c.present + c.late + c.absent + c.excused;
    return { section, students: enrolled.get(section) ?? 0, ...c, recorded, rate: recorded ? Math.round(((c.present + c.late) / recorded) * 1000) / 10 : null };
  });
}

export type OpenInvoice = { amount_sar: number; paid_total: number; due_date: string | null };
/** Outstanding balances by how late they are on a given day. */
export function ageing(invoices: OpenInvoice[], today: string) {
  const buckets = { notDue: 0, d30: 0, d60: 0, d90: 0, older: 0 };
  let total = 0;
  for (const invoice of invoices) {
    const due = Number(invoice.amount_sar) - Number(invoice.paid_total);
    if (due <= 0) continue;
    total += due;
    const late = invoice.due_date ? Math.floor((Date.parse(today) - Date.parse(invoice.due_date)) / 86400_000) : -1;
    if (late <= 0) buckets.notDue += due; else if (late <= 30) buckets.d30 += due; else if (late <= 60) buckets.d60 += due; else if (late <= 90) buckets.d90 += due; else buckets.older += due;
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  return { total: round(total), notDue: round(buckets.notDue), d30: round(buckets.d30), d60: round(buckets.d60), d90: round(buckets.d90), older: round(buckets.older) };
}

export type StaffDay = { staff_id: string; status: string };
export function staffSummary(rows: StaffDay[]) {
  const per = new Map<string, { present: number; late: number; absent: number; leave: number }>();
  for (const row of rows) {
    const item = per.get(row.staff_id) ?? { present: 0, late: 0, absent: 0, leave: 0 };
    if (row.status in item) item[row.status as keyof typeof item] += 1;
    per.set(row.staff_id, item);
  }
  return per;
}

export function monthRange(month: string): { from: string; to: string } {
  const [year, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(days).padStart(2, "0")}` };
}
