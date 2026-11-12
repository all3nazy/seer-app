"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { adjustPayrollLine, approvePayroll, checkInOut, decideLeave, generatePayroll, markStaffAttendance, requestLeave, saveStaff, type HrResult } from "../app/dashboard/staff/actions";
import { contractLabels, contractTypes, leaveKinds, leaveLabels, staffAttendanceLabels, staffAttendanceStatuses, type StaffProfile } from "../lib/hr";
import { notify } from "./feedback";

function useToast(state: HrResult, after?: () => void) {
  useEffect(() => { if (state.success) { notify(state.success, "info", "done"); after?.(); } else if (state.error) notify(state.error, "error"); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
}
function useRun() {
  const [pending, start] = useTransition();
  const run = (work: () => Promise<HrResult>) => start(async () => { const result = await work(); notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info", result.error ? undefined : "done"); });
  return { pending, run };
}
const v = (value: unknown) => value === null || value === undefined ? "" : String(value);

export function StaffForm({ organizationId, staff, members }: { organizationId: string; staff?: StaffProfile; members: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveStaff, {});
  const [key, setKey] = useState(0);
  useToast(state, () => { if (!staff) setKey(value => value + 1); });
  return <form key={key} action={action} className="composer">
    <input type="hidden" name="organization_id" value={organizationId} /><input type="hidden" name="staff_id" value={staff?.id ?? ""} />
    <label>الاسم<input name="full_name" required maxLength={120} defaultValue={v(staff?.full_name)} /></label>
    <label>المسمى الوظيفي<input name="job_title" maxLength={80} defaultValue={v(staff?.job_title)} placeholder="معلمة، مربية، سائق…" /></label>
    <label>الحساب في المنصة<select name="user_id" defaultValue={v(staff?.user_id)}><option value="">بدون حساب</option>{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
    <label>الهوية / الإقامة<input name="national_id" inputMode="numeric" dir="ltr" defaultValue={v(staff?.national_id)} /></label>
    <label>الجنسية<input name="nationality" maxLength={40} defaultValue={v(staff?.nationality)} /></label>
    <label>الجوال<input name="phone" inputMode="tel" dir="ltr" defaultValue={v(staff?.phone)} /></label>
    <label>تاريخ المباشرة<input type="date" name="hire_date" defaultValue={v(staff?.hire_date)} /></label>
    <label>نوع العقد<select name="contract_type" defaultValue={staff?.contract_type ?? "full_time"}>{contractTypes.map(type => <option key={type} value={type}>{contractLabels[type]}</option>)}</select></label>
    <label>نهاية العقد<input type="date" name="contract_end" defaultValue={v(staff?.contract_end)} /></label>
    <label>الراتب الأساسي<input name="basic_salary" inputMode="decimal" dir="ltr" defaultValue={v(staff?.basic_salary ?? 0)} /></label>
    <label>بدل السكن<input name="housing_allowance" inputMode="decimal" dir="ltr" defaultValue={v(staff?.housing_allowance ?? 0)} /></label>
    <label>بدل النقل<input name="transport_allowance" inputMode="decimal" dir="ltr" defaultValue={v(staff?.transport_allowance ?? 0)} /></label>
    <label>بدلات أخرى<input name="other_allowance" inputMode="decimal" dir="ltr" defaultValue={v(staff?.other_allowance ?? 0)} /></label>
    <label>التأمينات (حصة الموظف ٪)<input name="gosi_rate" inputMode="decimal" dir="ltr" defaultValue={v(staff?.gosi_rate ?? 0)} placeholder="9.75 للسعودي" /></label>
    <label>أيام الإجازة السنوية<input name="annual_leave_days" type="number" min={0} max={60} defaultValue={v(staff?.annual_leave_days ?? 21)} /></label>
    <label>الآيبان<input name="iban" dir="ltr" defaultValue={v(staff?.iban)} placeholder="SA…" /></label>
    {staff ? <label>الحالة<select name="status" defaultValue={staff.status}><option value="active">على رأس العمل</option><option value="left">انتهت خدمته</option></select></label> : null}
    <label style={{ gridColumn: "1/-1" }}>ملاحظات<textarea name="notes" maxLength={1000} rows={2} defaultValue={v(staff?.notes)} /></label>
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "جارٍ الحفظ…" : staff ? "حفظ" : "إضافة موظف"}</button>
  </form>;
}

export function LeaveForm({ organizationId, staffOptions, manager }: { organizationId: string; staffOptions: { id: string; name: string }[]; manager: boolean }) {
  const [state, action, pending] = useActionState(requestLeave, {});
  const [key, setKey] = useState(0);
  useToast(state, () => setKey(value => value + 1));
  return <form key={key} action={action} className="composer">
    <input type="hidden" name="organization_id" value={organizationId} />
    {staffOptions.length > 1 ? <label>الموظف<select name="staff_id" required>{staffOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : <input type="hidden" name="staff_id" value={staffOptions[0]?.id ?? ""} />}
    <label>النوع<select name="kind" defaultValue="annual">{leaveKinds.map(kind => <option key={kind} value={kind}>{leaveLabels[kind]}</option>)}</select></label>
    <label>من<input type="date" name="starts_on" required /></label>
    <label>إلى<input type="date" name="ends_on" /></label>
    <label style={{ gridColumn: "1/-1" }}>السبب<input name="reason" maxLength={500} /></label>
    {manager ? <label className="quote-check"><input type="checkbox" name="approve" /> اعتمادها مباشرة</label> : null}
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "…" : manager ? "تسجيل الإجازة" : "إرسال الطلب"}</button>
  </form>;
}
export function LeaveDecision({ organizationId, id, manager, mine }: { organizationId: string; id: string; manager: boolean; mine: boolean }) {
  const { pending, run } = useRun();
  return <span style={{ display: "flex", gap: 6 }}>
    {manager ? <><button type="button" className="btn btn-sm btn-primary" disabled={pending} onClick={() => run(() => decideLeave(organizationId, id, "approved"))}>اعتماد</button>
      <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => decideLeave(organizationId, id, "rejected"))}>رفض</button></> : null}
    {mine && !manager ? <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => decideLeave(organizationId, id, "cancelled"))}>إلغاء الطلب</button> : null}
  </span>;
}

export function CheckInButton({ organizationId, staffId, checkedIn, checkedOut }: { organizationId: string; staffId: string; checkedIn: string | null; checkedOut: string | null }) {
  const { pending, run } = useRun();
  const time = (iso: string) => new Date(iso).toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour: "numeric", minute: "2-digit" });
  if (checkedOut) return <p className="chip-soft ok">حضرت {checkedIn ? time(checkedIn) : ""} وانصرفت {time(checkedOut)}</p>;
  return <button type="button" className={`checkin${checkedIn ? " out" : ""}`} disabled={pending} onClick={() => run(() => checkInOut(organizationId, staffId))}>
    <strong>{checkedIn ? "تسجيل الانصراف" : "تسجيل الحضور"}</strong><span>{checkedIn ? `حضرت الساعة ${time(checkedIn)}` : "اضغط عند وصولك"}</span>
  </button>;
}
export function StaffAttendanceSelect({ organizationId, staffId, day, status }: { organizationId: string; staffId: string; day: string; status: string | null }) {
  const { pending, run } = useRun();
  return <select aria-label="الحالة" value={status ?? ""} disabled={pending} onChange={event => run(() => markStaffAttendance(organizationId, staffId, day, event.target.value))}>
    <option value="" disabled>—</option>{staffAttendanceStatuses.map(item => <option key={item} value={item}>{staffAttendanceLabels[item]}</option>)}
  </select>;
}

export function PayrollGenerate({ organizationId, month, exists }: { organizationId: string; month: string; exists: boolean }) {
  const { pending, run } = useRun();
  return <button type="button" className="btn-primary" disabled={pending} onClick={() => { if (!exists || window.confirm("إعادة الحساب تمسح المكافآت والخصومات اليدوية لهذا الشهر. متأكد؟")) run(() => generatePayroll(organizationId, month)); }}>{exists ? "إعادة حساب الشهر" : "حساب رواتب الشهر"}</button>;
}
export function PayrollAdjust({ organizationId, lineId, bonus, deduction, locked }: { organizationId: string; lineId: string; bonus: number; deduction: number; locked: boolean }) {
  const { pending, run } = useRun();
  const [values, setValues] = useState({ bonus: String(bonus), deduction: String(deduction) });
  const changed = Number(values.bonus) !== Number(bonus) || Number(values.deduction) !== Number(deduction);
  if (locked) return <>{Number(bonus) ? `+${bonus}` : ""} {Number(deduction) ? `−${deduction}` : ""}</>;
  return <span className="payroll-adjust">
    <input aria-label="مكافأة" inputMode="decimal" dir="ltr" value={values.bonus} onChange={event => setValues(current => ({ ...current, bonus: event.target.value }))} />
    <input aria-label="خصم" inputMode="decimal" dir="ltr" value={values.deduction} onChange={event => setValues(current => ({ ...current, deduction: event.target.value }))} />
    {changed ? <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => adjustPayrollLine(organizationId, lineId, Number(values.bonus) || 0, Number(values.deduction) || 0))}>حفظ</button> : null}
  </span>;
}
export function PayrollApprove({ organizationId, runId }: { organizationId: string; runId: string }) {
  const { pending, run } = useRun();
  return <button type="button" className="btn" disabled={pending} onClick={() => { if (window.confirm("بعد الاعتماد ما تتغير رواتب هذا الشهر. اعتماد؟")) run(() => approvePayroll(organizationId, runId)); }}>اعتماد الرواتب</button>;
}
