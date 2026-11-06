"use client";
import { useActionState, useState } from "react";
import { saveOperation, saveOrganization } from "../app/dashboard/operations/actions";
import { statusLabels, type Entity, type OperationRecord, type RecordOption } from "../lib/operations";

type FormProps = {
  organizationId: string;
  entity: Entity;
  records: OperationRecord[];
  childrenOptions: RecordOption[];
  branches: RecordOption[];
  guardians: RecordOption[];
};
function ReferenceSelect({ name, label, options, required = false, value }: { name: string; label: string; options: RecordOption[]; required?: boolean; value?: string | null }) {
  // Preserve a reference outside the current result page during unrelated edits.
  const missing = value && !options.some(option => option.id === value);
  return <label>{label}<select name={name} defaultValue={value ?? ""} required={required}>
    <option value="">{required ? "اختر سجلًا" : "غير محدد"}</option>
    {missing ? <option value={value}>السجل المرتبط حاليًا</option> : null}
    {options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
  </select></label>;
}
function RecordEditor({ organizationId, entity, childrenOptions, branches, guardians, record }: Omit<FormProps, "records"> & { record?: OperationRecord }) {
  const [state, action, pending] = useActionState(saveOperation, {});
  const statuses = entity === "enrollments" ? ["pending", "approved", "rejected", "withdrawn"] : ["draft", "issued", "paid", "void"];
  return <form action={action} className="operation-form">
    <input type="hidden" name="organization_id" value={organizationId} />
    <input type="hidden" name="entity" value={entity} />
    <input type="hidden" name="record_id" value={record?.id ?? ""} />
    <fieldset disabled={pending} style={{ border: 0, padding: 0, display: "grid", gap: 12 }}>
      <legend>{record ? "تعديل السجل المحدد" : "إضافة سجل جديد"}</legend>
      {entity === "branches" ? <label>اسم الفرع<input name="name" required maxLength={120} defaultValue={record?.name ?? ""} /></label> : null}
      {entity === "children" || entity === "guardians" ? <label>الاسم الكامل<input name="full_name" required maxLength={120} defaultValue={record?.full_name ?? ""} /></label> : null}
      {entity === "children" ? <label>تاريخ الميلاد (اختياري)<input type="date" name="date_of_birth" max={new Date().toISOString().slice(0, 10)} defaultValue={record?.date_of_birth ?? ""} /></label> : null}
      {entity === "guardians" ? <label>الهاتف (اختياري)<input type="tel" name="phone" maxLength={16} defaultValue={record?.phone ?? ""} dir="ltr" /></label> : null}
      {entity === "enrollments" ? <>
        <ReferenceSelect name="child_id" label="الطفل" options={childrenOptions} required value={record?.child_id} />
        <ReferenceSelect name="branch_id" label="الفرع (اختياري)" options={branches} value={record?.branch_id} />
      </> : null}
      {entity === "invoices" ? <>
        <ReferenceSelect name="guardian_id" label="ولي الأمر (اختياري)" options={guardians} value={record?.guardian_id} />
        <label>المبلغ بالريال<input type="number" name="amount_sar" min="0" max="9999999999.99" step="0.01" required defaultValue={record?.amount_sar ?? ""} /></label>
      </> : null}
      {entity === "enrollments" || entity === "invoices" ? <label>الحالة<select name="status" defaultValue={record?.status ?? statuses[0]}>{statuses.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label> : null}
      <label><input type="checkbox" name="confirmed" value="yes" required style={{ width: 24, display: "inline", verticalAlign: "middle" }} /> راجعت البيانات وأؤكد {record ? "حفظ التعديلات" : "إضافة السجل"}</label>
      <button type="submit" disabled={pending}>{pending ? "جارٍ الحفظ…" : record ? "حفظ التعديلات" : "إضافة السجل"}</button>
    </fieldset>
    {state.error ? <p role="alert">{state.error}</p> : null}
    {state.success ? <p role="status">{state.success}</p> : null}
  </form>;
}
export function OperationForm(props: FormProps) {
  const [recordId, setRecordId] = useState("");
  const record = props.records.find(row => row.id === recordId);
  return <div>
    <label>الإجراء<select value={recordId} onChange={event => setRecordId(event.target.value)}>
      <option value="">إضافة سجل جديد</option>
      {props.records.map((row, index) => <option key={row.id} value={row.id}>تعديل: {row.name ?? row.full_name ?? `${statusLabels[row.status ?? ""] ?? "سجل"} — ${index + 1}`}</option>)}
    </select></label>
    <RecordEditor key={`${props.organizationId}:${props.entity}:${recordId}`} {...props} record={record} />
  </div>;
}
export function OrganizationForm({ organizationId, name, type }: { organizationId: string; name: string; type: string }) {
  const [state, action, pending] = useActionState(saveOrganization, {});
  return <form action={action} className="operation-form">
    <input type="hidden" name="organization_id" value={organizationId} />
    <fieldset disabled={pending} style={{ border: 0, padding: 0, display: "grid", gap: 12 }}>
      <legend>إعدادات المنشأة</legend>
      <label>اسم المنشأة<input name="name" required maxLength={120} defaultValue={name} /></label>
      <label>نوع المنشأة<select name="type" defaultValue={type}><option value="school">مدرسة</option><option value="nursery">حضانة</option><option value="kindergarten">روضة</option></select></label>
      <label><input type="checkbox" name="confirmed" value="yes" required style={{ width: 24, display: "inline", verticalAlign: "middle" }} /> أؤكد حفظ إعدادات المنشأة</label>
      <button disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ الإعدادات"}</button>
    </fieldset>
    {state.error ? <p role="alert">{state.error}</p> : null}
    {state.success ? <p role="status">{state.success}</p> : null}
  </form>;
}
