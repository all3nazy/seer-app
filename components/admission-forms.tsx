"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { convertApplication, deleteApplication, reviewApplication, saveAdmissionSettings, type AdmissionResult } from "../app/dashboard/admissions/actions";
import { applicationStatusLabels, manualStatuses, riyadhLocalInput, type Application } from "../lib/admissions";
import type { RecordOption } from "../lib/operations";
import { notify } from "./feedback";

function useToast(state: AdmissionResult) { useEffect(() => { if (state.success) notify(state.success); }, [state]); }
const FormError = ({ state }: { state: AdmissionResult }) => state.error ? <p role="alert" className="form-error" style={{ gridColumn: "1/-1" }}>{state.error}</p> : null;

export function AdmissionSettingsForm({ organizationId, isOpen, intro, dailyLimit, link }: { organizationId: string; isOpen: boolean; intro: string | null; dailyLimit: number; link: string }) {
  const [state, action, pending] = useActionState(saveAdmissionSettings, {});
  const [copied, setCopied] = useState(false);
  useToast(state);
  return <div style={{ display: "grid", gap: 16 }}>
    <div className="info-banner" style={{ alignItems: "center", flexWrap: "wrap" }}>
      <span>رابط التقديم: <a href={link} dir="ltr" target="_blank" rel="noreferrer">{link}</a></span>
      <button type="button" className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true))}>{copied ? "نُسخ" : "نسخ الرابط"}</button>
    </div>
    <form action={action} className="operation-form" style={{ maxWidth: "none" }}>
      <input type="hidden" name="organization_id" value={organizationId} />
      <fieldset disabled={pending} style={{ border: 0, padding: 0, display: "grid", gap: 12 }}>
        <legend className="sr-only">إعدادات التقديم</legend>
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="checkbox" name="is_open" defaultChecked={isOpen} style={{ width: 22, minHeight: 22 }} />التقديم الإلكتروني مفتوح</label>
        <label>نص يظهر أعلى النموذج<textarea name="intro" maxLength={1000} defaultValue={intro ?? ""} placeholder="مثال: التسجيل مفتوح للعام ١٤٤٨. المقاعد محدودة." /></label>
        <label>أقصى عدد طلبات في اليوم<input type="number" name="daily_limit" min={1} max={1000} defaultValue={dailyLimit} style={{ maxWidth: 200 }} /></label>
        <button type="submit">{pending ? "جارٍ الحفظ…" : "حفظ"}</button>
      </fieldset>
      <FormError state={state} />
    </form>
  </div>;
}

export function ReviewForm({ organizationId, application, grades }: { organizationId: string; application: Application; grades: RecordOption[] }) {
  const [state, action, pending] = useActionState(reviewApplication, {});
  useToast(state);
  return <form action={action} className="composer">
    <input type="hidden" name="organization_id" value={organizationId} />
    <input type="hidden" name="application_id" value={application.id} />
    <label>الحالة<select name="status" defaultValue={application.status}>{manualStatuses.map(status => <option key={status} value={status}>{applicationStatusLabels[status]}</option>)}</select></label>
    <label>الصف<select name="grade_level_id" defaultValue={application.grade_level_id ?? ""}><option value="">غير محدد</option>{grades.map(grade => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label>
    <label>موعد المقابلة<input type="datetime-local" name="interview_at" defaultValue={riyadhLocalInput(application.interview_at)} /></label>
    <label style={{ gridColumn: "1/-1" }}>ملاحظات داخلية (ما يشوفها ولي الأمر)<textarea name="staff_notes" maxLength={2000} defaultValue={application.staff_notes ?? ""} /></label>
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ المراجعة"}</button>
    <FormError state={state} />
  </form>;
}

export function ConvertForm({ organizationId, applicationId, sections }: { organizationId: string; applicationId: string; sections: RecordOption[] }) {
  const [state, action, pending] = useActionState(convertApplication, {});
  const router = useRouter();
  useToast(state);
  useEffect(() => { if (state.childId) router.push(`/dashboard/children/${state.childId}?org=${encodeURIComponent(organizationId)}`); }, [state, organizationId, router]);
  return <form action={action} className="composer" onSubmit={event => { if (!window.confirm("تحويل الطلب لملف طالب؟ ينضاف الطالب وولي أمره وطلب تسجيل مقبول.")) event.preventDefault(); }}>
    <input type="hidden" name="organization_id" value={organizationId} />
    <input type="hidden" name="application_id" value={applicationId} />
    {sections.length ? <label>الشعبة (اختياري)<select name="section_id" defaultValue=""><option value="">بدون شعبة الحين</option>{sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label> : null}
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "جارٍ التحويل…" : "تسجيله طالبًا"}</button>
    <FormError state={state} />
  </form>;
}

export function DeleteApplicationButton({ organizationId, applicationId }: { organizationId: string; applicationId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => {
    if (!window.confirm("حذف الطلب نهائيًا؟")) return;
    start(async () => {
      const result = await deleteApplication(organizationId, applicationId);
      notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info");
      if (!result.error) router.push(`/dashboard/admissions?org=${encodeURIComponent(organizationId)}`);
    });
  }}>حذف الطلب</button>;
}
