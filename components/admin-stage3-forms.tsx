"use client";
import { useMemo, useState, useTransition } from "react";
import type { AdminResult } from "../app/admin/actions";
import { blockIp, inviteAdmin, issueInvoice, previewBroadcast, releaseLock, removeAdmin, saveCoupon, sendBroadcast, setAdminRole, unblockIp } from "../app/admin/stage3-actions";
import { adminRoleLabels, adminRoleNotes, adminRoles, type AdminRole } from "../lib/admin-roles";
import { broadcastStatuses, type BroadcastAudience, type BroadcastStatus, type Coupon } from "../lib/admin-stage3";
import { durationLabel } from "../lib/subscriptions";
import { arNumber } from "../lib/dates";
import { notify } from "./feedback";
import { confirmAction } from "./confirm";

function useRun() {
  const [pending, start] = useTransition();
  const run = (work: () => Promise<AdminResult>, after?: () => void) => start(async () => {
    const result = await work();
    notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info", result.error ? undefined : "done");
    if (!result.error) after?.();
  });
  return { pending, run };
}

// Coupons -------------------------------------------------------------------------------------------
/** Create (no coupon) or edit a coupon. Disabling is the «فعّال» switch. */
export function CouponEditor({ coupon, plans, onDone }: { coupon?: Coupon; plans: { id: string; name: string }[]; onDone?: () => void }) {
  const { pending, run } = useRun();
  const [kind, setKind] = useState<"percent" | "fixed">(coupon?.kind ?? "percent");
  const prefix = coupon ? `c-${coupon.id.slice(0, 8)}` : "c-new";
  return <form className="adm-coupon-form" aria-label={coupon ? `تعديل الكوبون ${coupon.code}` : "كوبون جديد"} onSubmit={event => {
    event.preventDefault();
    const form = event.currentTarget; const data = new FormData(form);
    run(() => saveCoupon(data), () => { if (!coupon) form.reset(); onDone?.(); });
  }}>
    {coupon ? <input type="hidden" name="id" value={coupon.id} /> : null}
    <label>الكود<input name="code" dir="ltr" defaultValue={coupon?.code} required minLength={3} maxLength={30} pattern="[A-Za-z0-9_\-]{3,30}" placeholder="RAMADAN20" autoCapitalize="characters" /></label>
    <label>نوع الخصم<select name="kind" value={kind} onChange={event => setKind(event.target.value as "percent" | "fixed")}><option value="percent">نسبة ٪</option><option value="fixed">مبلغ ثابت (ر.س)</option></select></label>
    <label>{kind === "percent" ? "النسبة ٪" : "المبلغ (ر.س)"}<input name="value" type="number" inputMode="decimal" min={0.01} max={kind === "percent" ? 100 : 1000000} step="0.01" defaultValue={coupon?.value} required /></label>
    <fieldset className="adm-checks"><legend>الباقات (بدون اختيار = كل الباقات)</legend>
      {plans.map(plan => <label key={plan.id} className="quote-check"><input type="checkbox" name="plans" value={plan.id} defaultChecked={coupon?.plan_ids.includes(plan.id)} /> <span>{plan.name}</span></label>)}
    </fieldset>
    <fieldset className="adm-checks"><legend>المدد (بدون اختيار = كل المدد)</legend>
      {[1, 3, 6, 12].map(months => <label key={months} className="quote-check"><input type="checkbox" name="months" value={months} defaultChecked={coupon?.months.includes(months)} /> <span>{durationLabel(months)}</span></label>)}
    </fieldset>
    <label>يبدأ من<input name="valid_from" type="date" defaultValue={coupon?.valid_from ?? ""} /></label>
    <label>ينتهي في<input name="valid_until" type="date" defaultValue={coupon?.valid_until ?? ""} /></label>
    <label>أقصى عدد استخدام (الكل)<input name="max_uses" type="number" min={1} step={1} inputMode="numeric" defaultValue={coupon?.max_uses ?? ""} placeholder="بدون حد" /></label>
    <label>أقصى استخدام لكل منشأة<input name="max_per_org" type="number" min={1} step={1} inputMode="numeric" defaultValue={coupon ? coupon.max_per_org ?? "" : 1} placeholder="بدون حد" /></label>
    <label className="quote-check" htmlFor={`${prefix}-first`}><input id={`${prefix}-first`} type="checkbox" name="first_payment_only" defaultChecked={coupon?.first_payment_only} /> <span>لأول دفعة فقط (وإلا: أي تجديد)</span></label>
    <label className="wide">ملاحظة داخلية<input name="note" maxLength={500} defaultValue={coupon?.note ?? ""} placeholder="مثلًا: عرض معرض التعليم" /></label>
    {coupon ? <label>الحالة<select name="is_active" defaultValue={coupon.is_active ? "on" : "off"}><option value="on">فعّال</option><option value="off">موقوف</option></select></label> : null}
    <span className="wide"><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "جارٍ الحفظ…" : coupon ? "حفظ التعديل" : "إضافة الكوبون"}</button></span>
  </form>;
}

/** A coupon row's «تعديل» toggle (the editor opens below the row). */
export function CouponEditToggle({ coupon, plans }: { coupon: Coupon; plans: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return <div style={{ display: "grid", gap: 8 }}>
    <span><button type="button" className="btn btn-sm" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? "إغلاق" : "تعديل"}<span className="sr-only"> {coupon.code}</span></button></span>
    {open ? <CouponEditor coupon={coupon} plans={plans} onDone={() => setOpen(false)} /> : null}
  </div>;
}

// Invoices ------------------------------------------------------------------------------------------
/** «إصدار فاتورة»: a manual adjustment for one organization (the owner is notified). */
export function IssueInvoiceForm({ org, orgName }: { org: string; orgName: string }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  if (!open) return <span><button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>إصدار فاتورة</button></span>;
  return <form className="composer" aria-label="إصدار فاتورة" onSubmit={async event => {
    event.preventDefault();
    const value = Number(amount);
    if (await confirmAction(`إصدار فاتورة بمبلغ ${arNumber(value)} ر.س لـ «${orgName}»؟ تأخذ رقمًا تسلسليًا ولا تنحذف.`)) {
      run(() => issueInvoice(org, description, value, note), () => { setOpen(false); setDescription(""); setAmount(""); setNote(""); });
    }
  }}>
    <label style={{ gridColumn: "1/-1" }}>الوصف<input value={description} onChange={event => setDescription(event.target.value)} required minLength={2} maxLength={300} placeholder="مثلًا: تسوية فرق الترقية إلى الباقة المتقدمة" /></label>
    <label>المبلغ (ر.س)<input type="number" inputMode="decimal" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} required /></label>
    <label>ملاحظة (تظهر في الفاتورة)<input value={note} onChange={event => setNote(event.target.value)} maxLength={500} /></label>
    <span className="adm-btn-row"><button type="submit" className="btn btn-primary" disabled={pending || description.trim().length < 2 || !Number(amount)}>إصدار</button>
      <button type="button" className="btn" onClick={() => setOpen(false)}>تراجع</button></span>
  </form>;
}

// Broadcast -----------------------------------------------------------------------------------------
type Counts = { organizations: number; recipients: number; emails: number };
/** Compose, choose the audience, preview the count, confirm and send once (an idempotency key per message). */
export function BroadcastComposer({ plans, orgs }: { plans: { id: string; name: string }[]; orgs: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [status, setStatus] = useState<BroadcastStatus>("all");
  const [plan, setPlan] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [pick, setPick] = useState(false);
  const [managers, setManagers] = useState(false);
  const [email, setEmail] = useState(true);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [filter, setFilter] = useState("");
  const audience: BroadcastAudience = { status, plan: plan || null, orgs: pick ? chosen : [], managers };
  const audienceKey = JSON.stringify(audience);
  const [countedFor, setCountedFor] = useState("");
  const shown = useMemo(() => orgs.filter(org => !filter.trim() || org.name.includes(filter.trim())).slice(0, 200), [orgs, filter]);
  const reset = () => { setCounts(null); setCountedFor(""); };
  const ready = title.trim().length >= 2 && body.trim().length >= 2 && (!pick || chosen.length > 0);
  const preview = () => start(async () => {
    const result = await previewBroadcast(audience);
    if (result.error || !result.counts) { notify(result.error ?? "تعذر الحساب.", "error"); return; }
    setCounts(result.counts); setCountedFor(audienceKey);
  });
  const send = async () => {
    if (!counts || countedFor !== audienceKey) { preview(); return; }
    const text = `إرسال «${title.trim()}» إلى ${arNumber(counts.recipients)} مستلم في ${arNumber(counts.organizations)} منشأة${email ? ` (و${arNumber(counts.emails)} بريد)` : ""}؟ ما يمكن التراجع بعد الإرسال.`;
    if (!(await confirmAction(text))) return;
    start(async () => {
      const result = await sendBroadcast(key, title, body, link, audience, email);
      notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info", result.error ? undefined : "done");
      if (!result.error) { setTitle(""); setBody(""); setLink(""); setChosen([]); setPick(false); reset(); setKey(crypto.randomUUID()); }
    });
  };
  return <form className="card adm-card adm-broadcast" aria-labelledby="bc-new" onSubmit={event => { event.preventDefault(); void send(); }}>
    <h2 id="bc-new">رسالة جديدة</h2>
    <label>العنوان<input value={title} onChange={event => setTitle(event.target.value)} required minLength={2} maxLength={120} placeholder="مثلًا: صيانة مجدولة الخميس" /></label>
    <label>النص<textarea rows={4} value={body} onChange={event => setBody(event.target.value)} required minLength={2} maxLength={2000} /></label>
    <label>رابط (اختياري)<input dir="ltr" value={link} onChange={event => setLink(event.target.value)} placeholder="/dashboard/billing أو https://…" /></label>
    <fieldset className="adm-checks"><legend>الجمهور</legend>
      <label>الحالة<select value={status} onChange={event => { setStatus(event.target.value as BroadcastStatus); reset(); }}>{broadcastStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>الباقة<select value={plan} onChange={event => { setPlan(event.target.value); reset(); }}><option value="">كل الباقات</option>{plans.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="quote-check"><input type="checkbox" checked={pick} onChange={event => { setPick(event.target.checked); reset(); }} /> <span>منشآت مختارة فقط</span></label>
    </fieldset>
    {pick ? <fieldset className="adm-org-pick"><legend>اختر المنشآت ({arNumber(chosen.length)})</legend>
      <input type="search" aria-label="بحث في المنشآت" placeholder="ابحث بالاسم" value={filter} onChange={event => setFilter(event.target.value)} />
      <div className="adm-org-pick-list">{shown.map(org => <label key={org.id} className="quote-check"><input type="checkbox" checked={chosen.includes(org.id)}
        onChange={event => { setChosen(current => event.target.checked ? [...current, org.id] : current.filter(id => id !== org.id)); reset(); }} /> <span>{org.name}</span></label>)}</div>
    </fieldset> : null}
    <fieldset className="adm-checks"><legend>القنوات</legend>
      <label className="quote-check"><input type="checkbox" checked disabled /> <span>إشعار داخل المنصة للملاك</span></label>
      <label className="quote-check"><input type="checkbox" checked={managers} onChange={event => { setManagers(event.target.checked); reset(); }} /> <span>وللمدراء كذلك</span></label>
      <label className="quote-check"><input type="checkbox" checked={email} onChange={event => setEmail(event.target.checked)} /> <span>بريد للملاك اللي عندهم بريد حقيقي</span></label>
    </fieldset>
    <p className="adm-preview" role="status" aria-live="polite">{counts && countedFor === audienceKey
      ? `توصل لـ ${arNumber(counts.recipients)} مستلم في ${arNumber(counts.organizations)} منشأة${email ? ` · ${arNumber(counts.emails)} بريد` : ""}.`
      : "احسب عدد المستلمين قبل الإرسال."}</p>
    <span className="adm-btn-row">
      <button type="button" className="btn" disabled={pending || (pick && !chosen.length)} onClick={preview}>احسب المستلمين</button>
      <button type="submit" className="btn btn-primary" disabled={pending || !ready || !counts || countedFor !== audienceKey || !counts.recipients}>{pending ? "جارٍ…" : "إرسال"}</button>
    </span>
  </form>;
}

// Login security ------------------------------------------------------------------------------------
export function ReleaseLockButton({ id, label }: { id: number; label: string }) {
  const { pending, run } = useRun();
  return <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => releaseLock(id))}>فك القفل<span className="sr-only"> {label}</span></button>;
}
export function BlockIpForm({ initialIp = "" }: { initialIp?: string }) {
  const { pending, run } = useRun();
  const [ip, setIp] = useState(initialIp);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("7");
  return <form className="composer" aria-label="حظر عنوان IP" onSubmit={async event => {
    event.preventDefault();
    const span = days === "forever" ? null : Number(days);
    if (await confirmAction(`حظر ${ip.trim()} من تسجيل الدخول${span ? ` لمدة ${arNumber(span)} يوم` : " بدون مدة"}؟ يشمل كل الحسابات من هذا العنوان.`)) run(() => blockIp(ip, reason, span), () => { setIp(""); setReason(""); });
  }}>
    <label>العنوان أو النطاق<input dir="ltr" value={ip} onChange={event => setIp(event.target.value)} required placeholder="203.0.113.7 أو 203.0.113.0/24" /></label>
    <label>المدة<select value={days} onChange={event => setDays(event.target.value)}><option value="1">يوم</option><option value="7">٧ أيام</option><option value="30">٣٠ يوم</option><option value="365">سنة</option><option value="forever">بدون مدة</option></select></label>
    <label style={{ gridColumn: "1/-1" }}>السبب<input value={reason} onChange={event => setReason(event.target.value)} required minLength={3} maxLength={300} placeholder="مثلًا: تخمين كلمات مرور على حسابات كثيرة" /></label>
    <span><button type="submit" className="btn btn-danger" disabled={pending || !ip.trim() || reason.trim().length < 3}>حظر</button></span>
  </form>;
}
export function UnblockButton({ id, ip }: { id: number; ip: string }) {
  const { pending, run } = useRun();
  return <button type="button" className="btn btn-sm" disabled={pending} onClick={async () => { if (await confirmAction(`رفع الحظر عن ${ip}؟`)) run(() => unblockIp(id)); }}>رفع الحظر<span className="sr-only"> {ip}</span></button>;
}

// Team ----------------------------------------------------------------------------------------------
export function InviteAdminForm() {
  const { pending, run } = useRun();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("support");
  return <form className="composer" aria-label="إضافة عضو للفريق" onSubmit={async event => {
    event.preventDefault();
    if (await confirmAction(`إضافة ${email.trim()} لفريق الإدارة بدور «${adminRoleLabels[role]}»؟`)) run(() => inviteAdmin(email, role), () => setEmail(""));
  }}>
    <label>البريد (حساب موجود في سِير)<input type="email" dir="ltr" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="off" /></label>
    <label>الدور<select value={role} onChange={event => setRole(event.target.value as AdminRole)}>{adminRoles.map(item => <option key={item} value={item}>{adminRoleLabels[item]}</option>)}</select></label>
    <p className="hint" style={{ gridColumn: "1/-1", margin: 0 }}>{adminRoleNotes[role]}. يُطلب منه التحقق الثنائي عند أول دخول.</p>
    <span><button type="submit" className="btn btn-primary" disabled={pending}>إضافة للفريق</button></span>
  </form>;
}
export function TeamMemberActions({ user, email, role, me }: { user: string; email: string; role: AdminRole; me: boolean }) {
  const { pending, run } = useRun();
  if (me) return <span className="hint">أنت</span>;
  return <span className="adm-btn-row">
    <label className="sr-only" htmlFor={`role-${user}`}>دور {email}</label>
    <select id={`role-${user}`} value={role} disabled={pending} onChange={async event => {
      const next = event.target.value as AdminRole;
      if (await confirmAction(`تغيير دور ${email} إلى «${adminRoleLabels[next]}»؟`)) run(() => setAdminRole(user, next));
    }}>{adminRoles.map(item => <option key={item} value={item}>{adminRoleLabels[item]}</option>)}</select>
    <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={async () => { if (await confirmAction(`إزالة ${email} من فريق الإدارة؟ يفقد الوصول للوحة فورًا.`)) run(() => removeAdmin(user)); }}>إزالة<span className="sr-only"> {email}</span></button>
  </span>;
}
