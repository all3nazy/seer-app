"use client";
import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveStudentHealth, saveStudentProfile, setStudentStatus, type ActionResult } from "../app/dashboard/children/actions";
import { bloodTypes, genderLabels, genders, riyadhToday, type ChildHealth, type ChildProfile } from "../lib/students";
import type { RecordOption } from "../lib/operations";
import { notify } from "./feedback";

function Result({ state }: { state: ActionResult }) {
  return <>{state.error ? <p role="alert" className="form-error">{state.error}</p> : null}{state.success ? <p role="status">{state.success}</p> : null}</>;
}
function useToast(state: ActionResult) {
  useEffect(() => { if (state.success) notify(state.success); }, [state]);
}

export function StudentProfileForm({ organizationId, branches, sections = [], child }: { organizationId: string; branches: RecordOption[]; sections?: RecordOption[]; child?: ChildProfile }) {
  const [state, action, pending] = useActionState(saveStudentProfile, {});
  const router = useRouter();
  useToast(state);
  useEffect(() => {
    if (!child && state.id) router.push(`/dashboard/children/${state.id}?org=${encodeURIComponent(organizationId)}`);
  }, [state, child, organizationId, router]);
  return <form action={action} className="operation-form" style={{ maxWidth: "none" }}>
    <input type="hidden" name="organization_id" value={organizationId} />
    <input type="hidden" name="child_id" value={child?.id ?? ""} />
    <fieldset disabled={pending} style={{ border: 0, padding: 0, display: "grid", gap: 12 }}>
      <legend className="sr-only">{child ? "تعديل بيانات الطالب" : "إضافة طالب"}</legend>
      <label>الاسم الكامل<input name="full_name" required maxLength={120} defaultValue={child?.full_name ?? ""} /></label>
      <div className="field-row">
        <label>تاريخ الميلاد<input type="date" name="date_of_birth" max={riyadhToday()} defaultValue={child?.date_of_birth ?? ""} /></label>
        <label>الجنس<select name="gender" defaultValue={child?.gender ?? ""}><option value="">غير محدد</option>{genders.map(item => <option key={item} value={item}>{genderLabels[item]}</option>)}</select></label>
        <label>رقم الهوية أو الإقامة<input name="national_id" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} dir="ltr" defaultValue={child?.national_id ?? ""} /></label>
      </div>
      <div className="field-row" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
        <label>الفرع<select name="branch_id" defaultValue={child?.branch_id ?? ""}><option value="">غير محدد</option>{branches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>الشعبة<select name="section_id" defaultValue={child?.section_id ?? ""}><option value="">بدون شعبة</option>{sections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontWeight: 400 }}><input type="checkbox" name="photo_consent" defaultChecked={child?.photo_consent ?? false} style={{ width: 20, minHeight: 20, marginTop: 3 }} />
        <span>ولي الأمر وافق كتابيًا على تصوير الطفل ومشاركة صوره معه داخل سِير. <span className="hint">احفظ نسخة الموافقة الموقّعة في ملف الطالب الورقي.</span></span></label>
      <label>ملاحظات<textarea name="notes" maxLength={1000} defaultValue={child?.notes ?? ""} /></label>
      <button type="submit">{pending ? "جارٍ الحفظ…" : child ? "حفظ البيانات" : "إضافة الطالب"}</button>
    </fieldset>
    <Result state={state} />
  </form>;
}

export function StudentHealthForm({ organizationId, childId, health }: { organizationId: string; childId: string; health: ChildHealth | null }) {
  const [state, action, pending] = useActionState(saveStudentHealth, {});
  useToast(state);
  return <form action={action} className="operation-form" style={{ maxWidth: "none" }}>
    <input type="hidden" name="organization_id" value={organizationId} />
    <input type="hidden" name="child_id" value={childId} />
    <fieldset disabled={pending} style={{ border: 0, padding: 0, display: "grid", gap: 12 }}>
      <legend className="sr-only">الملف الصحي</legend>
      <div className="field-row">
        <label>فصيلة الدم<select name="blood_type" defaultValue={health?.blood_type ?? ""} dir="ltr"><option value="">غير محددة</option>{bloodTypes.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>جهة الطوارئ<input name="emergency_name" maxLength={120} defaultValue={health?.emergency_name ?? ""} /></label>
        <label>رقم الطوارئ<input type="tel" name="emergency_phone" maxLength={16} dir="ltr" defaultValue={health?.emergency_phone ?? ""} /></label>
      </div>
      <label>الحساسية<textarea name="allergies" maxLength={500} defaultValue={health?.allergies ?? ""} placeholder="مثال: الفول السوداني، البيض" /></label>
      <label>حالات صحية مزمنة<textarea name="conditions" maxLength={500} defaultValue={health?.conditions ?? ""} /></label>
      <label>الأدوية<textarea name="medications" maxLength={500} defaultValue={health?.medications ?? ""} placeholder="اسم الدواء والجرعة والوقت" /></label>
      <label>ملاحظات صحية<textarea name="health_notes" maxLength={1000} defaultValue={health?.notes ?? ""} /></label>
      <button type="submit">{pending ? "جارٍ الحفظ…" : "حفظ الملف الصحي"}</button>
    </fieldset>
    <Result state={state} />
  </form>;
}

const studentStatusLabels: Record<string, string> = { active: "على رأس الدراسة", withdrawn: "منسحب", graduated: "متخرج" };
/** Change a student's status with a confirmation; their history is kept. */
export function StudentStatusControl({ organizationId, childId, status }: { organizationId: string; childId: string; status: string }) {
  const [pending, start] = useTransition();
  const change = (next: string, question: string) => {
    if (!window.confirm(question)) return;
    start(async () => {
      const result = await setStudentStatus(organizationId, childId, next);
      notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info");
    });
  };
  return <div className="chip-row" style={{ alignItems: "center", gap: 8 }}>
    <span className={`chip-soft ${status === "active" ? "ok" : status === "withdrawn" ? "rose" : "sky"}`}>{studentStatusLabels[status] ?? status}</span>
    {status === "active" ? <>
      <button type="button" className="btn btn-sm" disabled={pending} onClick={() => change("graduated", "تسجيل تخرّج الطالب؟ يبقى سجله، ويخرج من القوائم اليومية.")}>تخرّج</button>
      <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={() => change("withdrawn", "تسجيل انسحاب الطالب؟ يبقى سجله وفواتيره، ويخرج من الحضور والتسليم والباص وخطط الرسوم.")}>انسحاب</button>
    </> : <button type="button" className="btn btn-sm" disabled={pending} onClick={() => change("active", "إرجاع الطالب لقائمة الدراسة؟")}>إرجاع للدراسة</button>}
  </div>;
}
