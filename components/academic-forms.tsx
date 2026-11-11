"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { assignStudents, deleteAcademic, saveAcademic, type AcademicResult } from "../app/dashboard/academics/actions";
import { sectionGenderLabels, sectionGenders, stageLabels, stages, type AcademicTable } from "../lib/academics";
import type { RecordOption } from "../lib/operations";
import { notify } from "./feedback";
import { confirmAction } from "./confirm";

type Values = Record<string, string | number | boolean | null | undefined>;
type Options = { years?: RecordOption[]; grades?: RecordOption[]; branches?: RecordOption[]; members?: RecordOption[]; sections?: RecordOption[] };

function useResult(state: AcademicResult, onSuccess?: () => void) {
  useEffect(() => {
    if (state.success) { notify(state.success); onSuccess?.(); }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
}
function Select({ name, label, options, value, required, empty = "غير محدد" }: { name: string; label: string; options: RecordOption[]; value?: unknown; required?: boolean; empty?: string }) {
  return <label>{label}<select name={name} defaultValue={typeof value === "string" ? value : ""} required={required}>
    <option value="">{required ? "اختر" : empty}</option>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
  </select></label>;
}
const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));

function Fields({ table, record, options }: { table: AcademicTable; record?: Values; options: Options }) {
  const dates = (sameDay = false) => <>
    <label>من<input type="date" name="starts_on" required defaultValue={str(record?.starts_on)} /></label>
    <label>{sameDay ? "إلى (نفس اليوم إذا يوم واحد)" : "إلى"}<input type="date" name="ends_on" required defaultValue={str(record?.ends_on)} /></label>
  </>;
  switch (table) {
    case "academic_years": return <>
      <label>اسم السنة<input name="name" required maxLength={60} placeholder="مثال: ١٤٤٨ هـ" defaultValue={str(record?.name)} /></label>{dates()}
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="is_current" defaultChecked={Boolean(record?.is_current)} style={{ width: 22, minHeight: 22 }} />السنة الحالية</label>
    </>;
    case "academic_terms": return <>
      {record ? null : <Select name="academic_year_id" label="السنة الدراسية" options={options.years ?? []} required />}
      <label>اسم الفصل<input name="name" required maxLength={60} placeholder="الفصل الدراسي الأول" defaultValue={str(record?.name)} /></label>{dates()}
    </>;
    case "holidays": return <><label>اسم الإجازة<input name="name" required maxLength={80} defaultValue={str(record?.name)} /></label>{dates(true)}</>;
    case "grade_levels": return <>
      <label>اسم الصف<input name="name" required maxLength={60} placeholder="مثال: الصف الأول" defaultValue={str(record?.name)} /></label>
      <label>المرحلة<select name="stage" defaultValue={str(record?.stage) || "primary"}>{stages.map(item => <option key={item} value={item}>{stageLabels[item]}</option>)}</select></label>
      <label>الترتيب<input type="number" name="sort_order" min={0} max={1000} defaultValue={str(record?.sort_order) || "0"} /></label>
    </>;
    case "sections": return <>
      <Select name="grade_level_id" label="الصف" options={options.grades ?? []} value={record?.grade_level_id} required />
      <label>اسم الشعبة<input name="name" required maxLength={60} placeholder="أ" defaultValue={str(record?.name)} /></label>
      <label>النوع<select name="gender" defaultValue={str(record?.gender) || "mixed"}>{sectionGenders.map(item => <option key={item} value={item}>{sectionGenderLabels[item]}</option>)}</select></label>
      <label>السعة<input type="number" name="capacity" min={1} max={200} defaultValue={str(record?.capacity)} /></label>
      <Select name="branch_id" label="الفرع" options={options.branches ?? []} value={record?.branch_id} />
      <Select name="homeroom_teacher_id" label="رائد الشعبة" options={options.members ?? []} value={record?.homeroom_teacher_id} />
    </>;
    case "section_staff": return <>
      {record ? null : <><Select name="section_id" label="الشعبة" options={options.sections ?? []} required /><Select name="user_id" label="الموظف" options={options.members ?? []} required /></>}
      <label>المهمة<input name="duty" maxLength={60} placeholder="مثال: معلمة رياضيات" defaultValue={str(record?.duty)} /></label>
    </>;
  }
}

export function AcademicForm({ organizationId, table, record, options = {}, onDone, submitLabel }: { organizationId: string; table: AcademicTable; record?: Values & { id: string }; options?: Options; onDone?: () => void; submitLabel?: string }) {
  const [state, action, pending] = useActionState(saveAcademic, {});
  useResult(state, onDone);
  return <form action={action} className="composer" aria-label={record ? "تعديل" : "إضافة"}>
    <input type="hidden" name="organization_id" value={organizationId} />
    <input type="hidden" name="table" value={table} />
    <input type="hidden" name="record_id" value={record?.id ?? ""} />
    <Fields table={table} record={record} options={options} />
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "جارٍ الحفظ…" : submitLabel ?? (record ? "حفظ" : "إضافة")}</button>
    {state.error ? <p role="alert" className="form-error" style={{ gridColumn: "1/-1" }}>{state.error}</p> : null}
  </form>;
}

export function AcademicRow({ organizationId, table, record, options, children }: { organizationId: string; table: AcademicTable; record: Values & { id: string }; options?: Options; children: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  async function remove() {
    if (!(await confirmAction("حذف هذا السجل؟"))) return;
    start(async () => { const result = await deleteAcademic(organizationId, table, record.id); notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info"); });
  }
  return <li style={{ display: "grid", gap: 10 }}>
    <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
      <div style={{ minWidth: 0 }}>{children}</div>
      <span style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn btn-sm" onClick={() => setEditing(value => !value)} aria-expanded={editing}>{editing ? "إغلاق" : "تعديل"}</button>
        <button type="button" className="btn btn-sm btn-danger" onClick={remove} disabled={pending}>حذف</button>
      </span>
    </div>
    {editing ? <AcademicForm organizationId={organizationId} table={table} record={record} options={options} onDone={() => setEditing(false)} /> : null}
  </li>;
}

export function AssignStudents({ organizationId, sectionId, students, mode }: { organizationId: string; sectionId: string; students: RecordOption[]; mode: "add" | "remove" }) {
  const [state, action, pending] = useActionState(assignStudents, {});
  useResult(state);
  if (!students.length) return <p className="hint">{mode === "add" ? "كل الطلاب موزّعين على شُعب." : "ما فيه طلاب في هذه الشعبة."}</p>;
  return <form action={action} style={{ display: "grid", gap: 12 }}>
    <input type="hidden" name="organization_id" value={organizationId} />
    <input type="hidden" name="section_id" value={mode === "add" ? sectionId : ""} />
    <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 6, maxHeight: 320, overflowY: "auto" }}>
      <legend className="sr-only">{mode === "add" ? "اختر الطلاب لإضافتهم" : "اختر الطلاب لإخراجهم"}</legend>
      {students.map(student => <label key={student.id} style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 400 }}>
        <input type="checkbox" name="child_id" value={student.id} style={{ width: 20, minHeight: 20 }} />{student.name}
      </label>)}
    </fieldset>
    <button type="submit" className={mode === "add" ? "btn-primary" : "btn btn-danger"} disabled={pending} style={{ justifySelf: "start" }}>{pending ? "جارٍ الحفظ…" : mode === "add" ? "إضافة المحددين للشعبة" : "إخراج المحددين من الشعبة"}</button>
    {state.error ? <p role="alert" className="form-error">{state.error}</p> : null}
  </form>;
}
