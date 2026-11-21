"use client";
import { useEffect, useState, useTransition } from "react";
import type { AdminResult } from "../app/admin/actions";
import { cancelOrg, extendOrg, freeMonth, remindOnboarding, saveOrgNote, setEntitlements, setOrgPlan, setOrgSuspended, transferOwnership, unlockLogin } from "../app/admin/org-actions";
import { featureKeys, featureLabels } from "../lib/subscriptions";
import { HASH_EVENT } from "../lib/onboarding";
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

/** Tabs that follow the address hash (#billing…), so a link can open a tab. */
export function OrgTabs({ tabs }: { tabs: { id: string; label: string; content: React.ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0].id);
  useEffect(() => {
    const sync = () => { const id = decodeURIComponent(location.hash.slice(1)); setActive(tabs.some(tab => tab.id === id) ? id : tabs[0].id); };
    sync();
    window.addEventListener("hashchange", sync); window.addEventListener(HASH_EVENT, sync); window.addEventListener("popstate", sync);
    return () => { window.removeEventListener("hashchange", sync); window.removeEventListener(HASH_EVENT, sync); window.removeEventListener("popstate", sync); };
  }, [tabs.map(tab => tab.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (id: string) => { setActive(id); history.replaceState(null, "", `#${id}`); };
  return <div className="adm-tabs">
    <div className="adm-tablist" role="tablist" aria-label="أقسام ملف المنشأة">
      {tabs.map(tab => <button key={tab.id} type="button" role="tab" id={`tab-${tab.id}`} aria-selected={active === tab.id} aria-controls={`panel-${tab.id}`}
        tabIndex={active === tab.id ? 0 : -1} className={`adm-tab${active === tab.id ? " is-active" : ""}`} onClick={() => pick(tab.id)}
        onKeyDown={event => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          const ids = tabs.map(item => item.id);
          const next = ids[(ids.indexOf(active) + (event.key === "ArrowLeft" ? 1 : -1) + ids.length) % ids.length];
          pick(next); document.getElementById(`tab-${next}`)?.focus();
        }}>{tab.label}</button>)}
    </div>
    {tabs.map(tab => <div key={tab.id} role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} hidden={active !== tab.id} className="adm-panel">{tab.content}</div>)}
  </div>;
}

/** The header actions: extend (days or months), change plan, pause or resume, cancel with a reason. */
export function OrgHeaderActions({ org, plans, currentPlan, suspended, cancelled }: { org: string; plans: { id: string; name: string }[]; currentPlan: string | null; suspended: boolean; cancelled: boolean }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState<"extend" | "plan" | "cancel" | null>(null);
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState<"months" | "days">("months");
  const [plan, setPlan] = useState(currentPlan ?? plans[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const toggle = (which: typeof open) => setOpen(value => value === which ? null : which);
  return <div className="adm-org-actions">
    <div className="adm-btn-row">
      <button type="button" className="btn btn-primary" aria-expanded={open === "extend"} onClick={() => toggle("extend")}>تمديد الاشتراك</button>
      <button type="button" className="btn" aria-expanded={open === "plan"} onClick={() => toggle("plan")}>تغيير الباقة</button>
      {suspended
        ? <button type="button" className="btn" disabled={pending} onClick={() => run(() => setOrgSuspended(org, false))}>استئناف</button>
        : <button type="button" className="btn" disabled={pending} onClick={async () => { if (await confirmAction("إيقاف اشتراك هذه المنشأة مؤقتًا؟ تنقفل المنصة عندهم حتى الاستئناف.")) run(() => setOrgSuspended(org, true)); }}>إيقاف مؤقت</button>}
      {cancelled ? null : <button type="button" className="btn btn-danger" aria-expanded={open === "cancel"} onClick={() => toggle("cancel")}>إلغاء الاشتراك</button>}
    </div>
    {open === "extend" ? <form className="composer" onSubmit={event => { event.preventDefault(); run(() => extendOrg(org, amount, unit), () => setOpen(null)); }}>
      <label>المدة<input type="number" min={1} max={unit === "months" ? 24 : 730} value={amount} onChange={event => setAmount(Number(event.target.value))} required /></label>
      <label>الوحدة<select value={unit} onChange={event => setUnit(event.target.value as "months" | "days")}><option value="months">أشهر</option><option value="days">أيام</option></select></label>
      <button type="submit" className="btn btn-primary" disabled={pending}>تمديد</button>
    </form> : null}
    {open === "plan" ? <form className="composer" onSubmit={event => { event.preventDefault(); run(() => setOrgPlan(org, plan), () => setOpen(null)); }}>
      <label>الباقة<select value={plan} onChange={event => setPlan(event.target.value)}>{plans.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button type="submit" className="btn btn-primary" disabled={pending || plan === currentPlan}>حفظ الباقة</button>
    </form> : null}
    {open === "cancel" ? <form className="composer" onSubmit={async event => {
      event.preventDefault();
      if (await confirmAction("إلغاء الاشتراك؟ تنقفل المنصة عندهم الحين بدون مهلة، وتبقى بياناتهم. يقدر التمديد يرجّعها.")) run(() => cancelOrg(org, reason), () => { setOpen(null); setReason(""); });
    }}>
      <label style={{ gridColumn: "1/-1" }}>سبب الإلغاء (يوصل للمالك)<textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={500} required /></label>
      <button type="submit" className="btn btn-danger" disabled={pending || reason.trim().length < 3}>تأكيد الإلغاء</button>
    </form> : null}
  </div>;
}

export function FreeMonthButton({ org }: { org: string }) {
  const { pending, run } = useRun();
  return <button type="button" className="btn" disabled={pending} onClick={async () => { if (await confirmAction("إضافة شهر مجاني لهذه المنشأة؟")) run(() => freeMonth(org)); }}>+ شهر مجاني</button>;
}

export type OrgMember = { user_id: string; name: string | null; role: string; login: string; locked: boolean; last_sign_in_at: string | null };
export function MemberActions({ org, member }: { org: string; member: OrgMember }) {
  const { pending, run } = useRun();
  return <span className="adm-btn-row">
    {member.locked ? <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => unlockLogin(org, member.user_id))}>فك قفل الدخول</button> : null}
    {member.role !== "owner" ? <button type="button" className="btn btn-sm" disabled={pending} onClick={async () => {
      if (await confirmAction(`نقل ملكية المنشأة إلى «${member.name || member.login}»؟ المالك الحالي يصير مديرًا، ويوصل الطرفين إشعار.`)) run(() => transferOwnership(org, member.user_id));
    }}>نقل الملكية له</button> : null}
  </span>;
}

/** What the organization may use at all (the subscriber then chooses what to show among those). */
export function EntitlementsForm({ org, planFeatures, blocked, disabled, trial }: { org: string; planFeatures: string[]; blocked: string[]; disabled: string[]; trial: boolean }) {
  const { pending, run } = useRun();
  const [off, setOff] = useState<string[]>(blocked);
  const changed = off.slice().sort().join() !== blocked.slice().sort().join();
  return <form onSubmit={event => { event.preventDefault(); run(() => setEntitlements(org, off)); }} style={{ display: "grid", gap: 10 }}>
    <p className="hint" style={{ margin: 0 }}>يقرر المشترك وش يظهر من أقسامه، وأنت تقرر وش متاح له أصلًا. القسم الممنوع يختفي عندهم وتنرفض عملياته.</p>
    <ul className="adm-switches">{featureKeys.map(key => {
      const inPlan = trial || planFeatures.includes(key);
      const allowed = !off.includes(key);
      return <li key={key}>
        <label className="adm-switch-row">
          <span><strong>{featureLabels[key]}</strong><span className="hint" style={{ display: "block" }}>{!inPlan ? "خارج باقتهم" : disabled.includes(key) ? "مطفي عندهم" : "متاح ومفعّل"}</span></span>
          <input type="checkbox" role="switch" checked={allowed} onChange={event => setOff(current => event.target.checked ? current.filter(item => item !== key) : [...current, key])} aria-label={`${featureLabels[key]}: ${allowed ? "متاح" : "ممنوع"}`} />
        </label>
      </li>;
    })}</ul>
    <span><button type="submit" className="btn btn-primary" disabled={pending || !changed}>حفظ الأقسام المتاحة</button></span>
  </form>;
}

export function RemindButton({ org }: { org: string }) {
  const { pending, run } = useRun();
  return <button type="button" className="btn" disabled={pending} onClick={() => run(() => remindOnboarding(org))}>ذكّرهم برسالة</button>;
}

export function NoteEditor({ org, body }: { org: string; body: string }) {
  const { pending, run } = useRun();
  const [text, setText] = useState(body);
  return <form onSubmit={event => { event.preventDefault(); run(() => saveOrgNote(org, text)); }} style={{ display: "grid", gap: 8 }}>
    <label htmlFor="org-note" className="hint">تظهر لك ولفريق الإدارة فقط</label>
    <textarea id="org-note" rows={4} value={text} onChange={event => setText(event.target.value)} maxLength={4000} />
    <span><button type="submit" className="btn" disabled={pending || text === body}>{pending ? "جارٍ الحفظ…" : "حفظ الملاحظة"}</button></span>
  </form>;
}
