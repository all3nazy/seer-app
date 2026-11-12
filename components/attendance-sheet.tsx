"use client";
import { useActionState, useEffect, useMemo, useState } from "react";
import { saveAttendance } from "../app/dashboard/children/actions";
import { attendanceLabels, attendanceStatuses, attendanceTone, type AttendanceRow, type AttendanceStatus } from "../lib/students";
import { notify } from "./feedback";
import { arNumber } from "../lib/dates";

type Student = { id: string; full_name: string; alert: boolean };
type Props = { organizationId: string; day: string; editable: boolean; students: Student[]; records: AttendanceRow[] };

export function AttendanceSheet({ organizationId, day, editable, students, records }: Props) {
  const [state, action, pending] = useActionState(saveAttendance, {});
  const initial = useMemo(() => Object.fromEntries(records.map(row => [row.child_id, row.status])) as Record<string, AttendanceStatus>, [records]);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus | "">>(initial);
  useEffect(() => { if (state.success) notify(state.success, "info", "done"); else if (state.error) notify(state.error, "error"); }, [state]);
  const notes = Object.fromEntries(records.map(row => [row.child_id, row.note ?? ""]));
  const counts = attendanceStatuses.map(status => ({ status, count: Object.values(statuses).filter(value => value === status).length }));
  const unmarked = students.filter(student => !statuses[student.id]).length;
  const markRemaining = () => setStatuses(current => ({ ...Object.fromEntries(students.map(student => [student.id, current[student.id] || "present"])) }));
  return <form action={action} aria-label="كشف الحضور">
    <input type="hidden" name="organization_id" value={organizationId} />
    <input type="hidden" name="attendance_date" value={day} />
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }} aria-live="polite">
      {counts.map(item => <span key={item.status} className={`chip-soft ${attendanceTone[item.status]}`}>{attendanceLabels[item.status]}: {arNumber(item.count)}</span>)}
      <span className="chip-soft">بدون تسجيل: {arNumber(unmarked)}</span>
      {editable && unmarked ? <button type="button" className="btn btn-sm" onClick={markRemaining}>تحديد الباقين حاضرين</button> : null}
    </div>
    <div className="table-wrap"><table className="links-table" style={{ width: "100%" }}>
      <thead><tr><th scope="col">الطالب</th><th scope="col">الحالة</th><th scope="col">ملاحظة</th></tr></thead>
      <tbody>{students.map(student => <tr key={student.id}>
        <td><a href={`/dashboard/children/${student.id}?org=${encodeURIComponent(organizationId)}`}>{student.full_name}</a>{student.alert ? <span className="chip-soft rose" style={{ marginInlineStart: 8 }} title="لديه تنبيه صحي">تنبيه صحي</span> : null}</td>
        <td><select name={`status:${student.id}`} aria-label={`حالة ${student.full_name}`} disabled={!editable} value={statuses[student.id] ?? ""}
          onChange={event => setStatuses(current => ({ ...current, [student.id]: event.target.value as AttendanceStatus | "" }))} style={{ minWidth: 130 }}>
          <option value="">—</option>{attendanceStatuses.map(status => <option key={status} value={status}>{attendanceLabels[status]}</option>)}
        </select></td>
        <td><input name={`note:${student.id}`} aria-label={`ملاحظة ${student.full_name}`} maxLength={200} defaultValue={notes[student.id] ?? ""} disabled={!editable} placeholder="اختياري" /></td>
      </tr>)}</tbody>
    </table></div>
    {editable ? <button type="submit" className="btn-primary" disabled={pending} style={{ marginTop: 16 }}>{pending ? "جارٍ الحفظ…" : "حفظ الكشف"}</button>
      : <p className="hint" style={{ marginTop: 12 }}>تعديل الأيام السابقة لمسؤول المنشأة فقط.</p>}
    {state.error ? <p role="alert" className="form-error">{state.error}</p> : null}
  </form>;
}
