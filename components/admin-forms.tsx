"use client";
import { useState, useTransition } from "react";
import { approvePayment, changePlan, extendSubscription, rejectPayment, saveDuration, saveNote, savePlan, saveSettings, setSuspended, type AdminResult } from "../app/admin/actions";
import { featureKeys, featureLabels } from "../lib/subscriptions";
import { notify } from "./feedback";

function useRun() {
  const [pending, start] = useTransition();
  const run = (work: () => Promise<AdminResult>, after?: () => void) => start(async () => {
    const result = await work();
    notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info", result.error ? undefined : "done");
    if (!result.error) after?.();
  });
  return { pending, run };
}

export function PaymentDecision({ id }: { id: string }) {
  const { pending, run } = useRun();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  if (rejecting) return <div style={{ display: "grid", gap: 6 }}>
    <textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} placeholder="سبب الرفض (يوصل للمشترك)" maxLength={500} />
    <span style={{ display: "flex", gap: 6 }}><button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={() => run(() => rejectPayment(id, reason))}>تأكيد الرفض</button><button type="button" className="btn btn-sm" onClick={() => setRejecting(false)}>إلغاء</button></span>
  </div>;
  return <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
    <button type="button" className="btn btn-sm btn-primary" disabled={pending} onClick={() => { if (window.confirm("اعتماد التحويل وتفعيل الاشتراك؟")) run(() => approvePayment(id)); }}>اعتماد</button>
    <button type="button" className="btn btn-sm" disabled={pending} onClick={() => setRejecting(true)}>رفض</button>
  </span>;
}

export function SubscriberActions({ org, plans, currentPlan, suspended, note }: { org: string; plans: { id: string; name: string }[]; currentPlan: string | null; suspended: boolean; note: string | null }) {
  const { pending, run } = useRun();
  const [days, setDays] = useState(30);
  const [plan, setPlan] = useState(currentPlan ?? plans[0]?.id ?? "");
  const [text, setText] = useState(note ?? "");
  return <div className="admin-actions">
    <div className="composer">
      <label>تمديد بعدد أيام<input type="number" min={1} max={730} value={days} onChange={event => setDays(Number(event.target.value))} /></label>
      <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => extendSubscription(org, days))}>تمديد</button>
    </div>
    <div className="composer">
      <label>الباقة<select value={plan} onChange={event => setPlan(event.target.value)}>{plans.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button type="button" className="btn" disabled={pending || plan === currentPlan} onClick={() => run(() => changePlan(org, plan))}>تغيير الباقة</button>
    </div>
    <div className="composer">
      <label style={{ gridColumn: "1/-1" }}>ملاحظة داخلية<textarea rows={2} value={text} onChange={event => setText(event.target.value)} maxLength={2000} /></label>
      <button type="button" className="btn" disabled={pending} onClick={() => run(() => saveNote(org, text))}>حفظ الملاحظة</button>
    </div>
    <span>{suspended
      ? <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => setSuspended(org, false))}>إعادة التفعيل</button>
      : <button type="button" className="btn btn-danger" disabled={pending} onClick={() => { if (window.confirm("إيقاف اشتراك هذه المنشأة؟ تنقفل المنصة عندهم حتى إعادة التفعيل.")) run(() => setSuspended(org, true)); }}>إيقاف الاشتراك</button>}</span>
  </div>;
}

export function PlanForm({ plan }: { plan?: { id: string; key: string; name: string; description: string | null; features: string[]; monthly_price: number; sort_order: number; is_active: boolean } }) {
  const { pending, run } = useRun();
  return <form className="composer plan-form" action={data => run(() => savePlan(data))}>
    <input type="hidden" name="id" value={plan?.id ?? ""} />
    {plan ? null : <label>المفتاح (إنجليزي)<input name="key" dir="ltr" required pattern="[a-z][a-z0-9_]{1,30}" placeholder="premium" /></label>}
    <label>الاسم<input name="name" defaultValue={plan?.name} required maxLength={60} /></label>
    <label>السعر الشهري (ر.س)<input name="monthly_price" type="number" min={0} step="0.01" defaultValue={plan?.monthly_price ?? 0} required /></label>
    <label>الترتيب<input name="sort_order" type="number" defaultValue={plan?.sort_order ?? 0} /></label>
    <label style={{ gridColumn: "1/-1" }}>الوصف<input name="description" defaultValue={plan?.description ?? ""} maxLength={300} /></label>
    <fieldset className="quote-items" style={{ gridColumn: "1/-1" }}><legend>المزايا</legend>
      {featureKeys.map(key => <label key={key} className="quote-check"><input type="checkbox" name="features" value={key} defaultChecked={plan?.features.includes(key)} /> {featureLabels[key]}</label>)}
    </fieldset>
    <label className="quote-check"><input type="checkbox" name="is_active" defaultChecked={plan?.is_active ?? true} /> معروضة للمشتركين</label>
    <button type="submit" className="btn-primary" disabled={pending}>{plan ? "حفظ الباقة" : "إضافة الباقة"}</button>
  </form>;
}

export function DurationRow({ months, discount, active }: { months: number; discount: number; active: boolean }) {
  const { pending, run } = useRun();
  const [value, setValue] = useState(Number(discount));
  const [on, setOn] = useState(active);
  return <tr><td>{months === 12 ? "سنة" : `${months} شهر`}</td>
    <td><input type="number" min={0} max={90} step="0.5" value={value} onChange={event => setValue(Number(event.target.value))} style={{ width: 90 }} />٪</td>
    <td><input type="checkbox" checked={on} onChange={event => setOn(event.target.checked)} aria-label="مفعّلة" /></td>
    <td><button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => saveDuration(months, value, on))}>حفظ</button></td></tr>;
}

export function SettingsForm({ settings }: { settings: { bank_accounts: { bank: string; holder: string; iban: string }[]; trial_days: number; grace_days: number; lock_family_links: boolean } }) {
  const { pending, run } = useRun();
  const rows = [0, 1, 2].map(index => settings.bank_accounts[index] ?? { bank: "", holder: "", iban: "" });
  return <form className="admin-settings" action={data => run(() => saveSettings(data))}>
    <fieldset><legend>الحسابات البنكية للتحويل</legend>
      {rows.map((account, index) => <div key={index} className="composer">
        <label>اسم البنك<input name={`bank_${index}`} defaultValue={account.bank} maxLength={60} /></label>
        <label>اسم صاحب الحساب<input name={`holder_${index}`} defaultValue={account.holder} maxLength={120} /></label>
        <label>الآيبان<input name={`iban_${index}`} dir="ltr" defaultValue={account.iban} maxLength={34} placeholder="SA00 0000 0000 0000 0000 0000" /></label>
      </div>)}
    </fieldset>
    <div className="composer">
      <label>مدة التجربة (أيام)<input name="trial_days" type="number" min={1} max={90} defaultValue={settings.trial_days} /></label>
      <label>المهلة بعد الانتهاء (أيام)<input name="grace_days" type="number" min={0} max={60} defaultValue={settings.grace_days} /></label>
      <label className="quote-check" style={{ gridColumn: "1/-1" }}><input type="checkbox" name="lock_family_links" defaultChecked={settings.lock_family_links} /> إيقاف روابط أولياء الأمور (البوابة والفواتير والدفع) وقت قفل المنشأة</label>
      <button type="submit" className="btn-primary" disabled={pending}>حفظ الإعدادات</button>
    </div>
  </form>;
}
