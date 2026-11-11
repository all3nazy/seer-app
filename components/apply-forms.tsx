"use client";
import { useActionState } from "react";
import { checkApplication, submitApplication } from "../app/apply/actions";
import { applicationStatusLabels, isApplicationStatus } from "../lib/admissions";
import { relationshipLabels, relationships } from "../lib/team";
import { riyadhToday } from "../lib/students";
import { processingNotice } from "../lib/legal";

export function ApplyForm({ organizationId, grades }: { organizationId: string; grades: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(submitApplication, {});
  if (state.reference) return <div role="status" style={{ display: "grid", gap: 12 }}>
    <h2>وصلنا طلبك</h2>
    <p>رقم طلبك: <strong dir="ltr" style={{ fontSize: 22, letterSpacing: 2 }}>{state.reference}</strong></p>
    <p>احتفظ بالرقم. تقدر تتابع حالة طلبك من <a href="/apply/status">صفحة متابعة الطلب</a> بالرقم ونفس الجوال اللي كتبته.</p>
  </div>;
  return <form action={action} className="login-form" aria-busy={pending}>
    <input type="hidden" name="organization_id" value={organizationId} />
    <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
      <label>الموقع<input name="website" tabIndex={-1} autoComplete="off" /></label>
    </div>
    <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 12 }}>
      <legend style={{ fontWeight: 700, marginBottom: 4 }}>بيانات الطفل</legend>
      <label>اسم الطفل الكامل<input name="child_name" required maxLength={120} autoComplete="off" /></label>
      <label>تاريخ الميلاد<input type="date" name="child_birth_date" max={riyadhToday()} /></label>
      <label>الجنس<select name="child_gender" defaultValue=""><option value="">اختر</option><option value="male">ذكر</option><option value="female">أنثى</option></select></label>
      {grades.length ? <label>الصف المطلوب<select name="grade_level_id" defaultValue=""><option value="">غير محدد</option>{grades.map(grade => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label> : null}
    </fieldset>
    <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: "8px 0 0", display: "grid", gap: 12 }}>
      <legend style={{ fontWeight: 700, marginBottom: 4 }}>بيانات ولي الأمر</legend>
      <label>الاسم<input name="guardian_name" required maxLength={120} autoComplete="name" /></label>
      <label>صلة القرابة<select name="relationship" defaultValue="father">{relationships.map(item => <option key={item} value={item}>{relationshipLabels[item]}</option>)}</select></label>
      <label>الجوال<input type="tel" name="guardian_phone" required maxLength={16} dir="ltr" autoComplete="tel" placeholder="05xxxxxxxx" /></label>
      <label>البريد الإلكتروني (اختياري)<input type="email" name="guardian_email" maxLength={254} dir="ltr" autoComplete="email" /></label>
      <label>ملاحظات (اختياري)<textarea name="family_notes" maxLength={1000} placeholder="مثلاً: احتياجات خاصة، إخوان في المدرسة، أوقات التواصل المناسبة" /></label>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontWeight: 400 }}><input type="checkbox" name="consent" required style={{ width: 20, minHeight: 20, marginTop: 3 }} />
        أوافق على استخدام هذه البيانات لغرض دراسة طلب القبول والتواصل معي بخصوصه فقط.</label>
      <p className="processing-notice">{processingNotice.replace("سياسة الخصوصية", "")}<a href="/privacy" target="_blank" rel="noopener noreferrer">سياسة الخصوصية</a>.</p>
      <button type="submit" className="primary-button">{pending ? "جارٍ الإرسال…" : "إرسال الطلب"}</button>
    </fieldset>
    {state.error ? <p role="alert" className="form-error">{state.error}</p> : null}
  </form>;
}

export function StatusForm() {
  const [state, action, pending] = useActionState(checkApplication, {});
  return <form action={action} className="login-form" aria-busy={pending}>
    <label>رقم الطلب<input name="reference" required maxLength={8} dir="ltr" autoCapitalize="characters" autoComplete="off" style={{ letterSpacing: 2 }} /></label>
    <label>الجوال اللي قدّمت فيه<input type="tel" name="phone" required maxLength={16} dir="ltr" autoComplete="tel" /></label>
    <button type="submit" className="primary-button" disabled={pending}>{pending ? "جارٍ البحث…" : "عرض الحالة"}</button>
    {state.error ? <p role="alert" className="form-error">{state.error}</p> : null}
    {state.status ? <div role="status" className="info-banner" style={{ display: "grid", gap: 4 }}>
      <span>{state.organization}</span>
      <strong>الحالة: {isApplicationStatus(state.status) ? applicationStatusLabels[state.status] : state.status}</strong>
      {state.interview_at ? <span>موعد المقابلة: {new Date(state.interview_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "full", timeStyle: "short" })}</span> : null}
    </div> : null}
  </form>;
}
