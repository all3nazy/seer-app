"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { inviteLink, inviteMessage, inviteStatusLabels, orgTypeLabels, trialLabel } from "../lib/org-invites";
import { whatsappLink } from "../lib/share";
import { confirmAction } from "./confirm";
import { notify } from "./feedback";

export type InviteRow = { id: string; org_name: string; org_type: string; plan: string; trial_months: number; note: string | null; status: string; created_at: string; expires_at: string; used_at: string | null; organization_id: string | null; organization: string | null };
type Plan = { id: string; key: string; name: string };
const errorText = (code?: string) => code === "42501" ? "لمسؤول المنصة فقط." : code === "22023" ? "تحقق من الاسم والنوع وعدد الأشهر (١ إلى ١٢)." : "تعذر التنفيذ. حاول مرة ثانية.";
const date = (iso: string) => new Date(iso).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh", day: "numeric", month: "short" });

/** A new link, shown once: copy it or send it on WhatsApp. Only its hash is stored. */
function FreshLink({ token, orgName, months, onDone }: { token: string; orgName: string; months: number; onDone: () => void }) {
  const link = inviteLink(window.location.origin, token);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); notify("نُسخ الرابط.", "info", "done"); } catch { notify("ما قدرت أنسخ. حدّد الرابط وانسخه يدويًا.", "error"); }
  };
  return <div className="invite-fresh" role="status">
    <p style={{ margin: 0 }}><strong>رابط «{orgName}» جاهز.</strong> يظهر لك هذه المرة فقط، وصالح ٧ أيام ولمرة وحدة.</p>
    <input readOnly dir="ltr" value={link} aria-label="رابط الدعوة" onFocus={event => event.currentTarget.select()} />
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" className="btn btn-primary" onClick={() => void copy()}>نسخ</button>
      <a className="btn" href={whatsappLink(null, inviteMessage(orgName, months, link))} target="_blank" rel="noopener noreferrer">أرسل بالواتساب</a>
      <button type="button" className="btn" onClick={onDone}>تم</button>
    </div>
  </div>;
}

/** «ادعُ مدرسة» and the list of invites (pending, used, expired, revoked) with revoke and reissue. */
export function OrgInvites({ invites, plans }: { invites: InviteRow[]; plans: Plan[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ token: string; orgName: string; months: number } | null>(null);
  const advanced = plans.find(plan => plan.key === "advanced")?.id ?? plans[0]?.id ?? "";
  const [form, setForm] = useState({ name: "", type: "school", plan: advanced, months: 3, note: "" });
  // Browser-side calls (not server actions): the list is refreshed once after each change.
  const refresh = () => startTransition(() => router.refresh());
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const { data, error } = await getSupabaseBrowserClient().rpc("admin_create_org_invite", { org_name: form.name.trim(), org_type: form.type, plan: form.plan || null, trial_months: form.months, note: form.note.trim() || null });
    setBusy(false);
    if (error || typeof data !== "string") { notify(errorText(error?.code), "error"); return; }
    setFresh({ token: data, orgName: form.name.trim(), months: form.months });
    setForm({ name: "", type: "school", plan: advanced, months: 3, note: "" });
    setOpen(false);
    refresh();
  }
  async function revoke(row: InviteRow) {
    if (!(await confirmAction(`إلغاء دعوة «${row.org_name}»؟ الرابط يتوقف فورًا.`))) return;
    const { error } = await getSupabaseBrowserClient().rpc("admin_revoke_org_invite", { invite: row.id });
    if (error) { notify(errorText(error.code), "error"); return; }
    notify("أُلغيت الدعوة.", "info", "done");
    refresh();
  }
  async function reissue(row: InviteRow) {
    if (!(await confirmAction(`إصدار رابط جديد لـ«${row.org_name}»؟ الرابط القديم يتوقف.`))) return;
    const { data, error } = await getSupabaseBrowserClient().rpc("admin_reissue_org_invite", { invite: row.id });
    if (error || typeof data !== "string") { notify(errorText(error?.code), "error"); return; }
    setFresh({ token: data, orgName: row.org_name, months: row.trial_months });
    refresh();
  }
  return <section className="card org-invites" aria-labelledby="invites-title" style={{ marginBottom: 16 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <h2 id="invites-title" style={{ margin: 0, fontSize: 18 }}>دعوات المنشآت</h2>
      <button type="button" className="btn btn-primary" aria-expanded={open} onClick={() => setOpen(value => !value)}>ادعُ مدرسة</button>
    </div>
    {fresh ? <FreshLink token={fresh.token} orgName={fresh.orgName} months={fresh.months} onDone={() => setFresh(null)} /> : null}
    {open ? <form className="composer invite-form" onSubmit={create}>
      <label>اسم المنشأة<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required minLength={2} maxLength={120} placeholder="مثال: مدرسة النخبة الأهلية" /></label>
      <label>النوع<select value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}>
        <option value="school">مدرسة</option><option value="nursery">حضانة</option><option value="kindergarten">روضة</option></select></label>
      <label>الباقة<select value={form.plan} onChange={event => setForm({ ...form, plan: event.target.value })}>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
      <label>أشهر التجربة المجانية<select value={form.months} onChange={event => setForm({ ...form, months: Number(event.target.value) })}>
        {Array.from({ length: 12 }, (_, index) => index + 1).map(n => <option key={n} value={n}>{trialLabel(n)}</option>)}</select></label>
      <label style={{ gridColumn: "1/-1" }}>ملاحظة داخلية (اختياري)<input value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} maxLength={500} placeholder="ما تظهر للمدرسة" /></label>
      <span><button type="submit" className="btn btn-primary" disabled={busy || form.name.trim().length < 2}>{busy ? "جارٍ الإنشاء…" : "أنشئ رابط الدعوة"}</button></span>
    </form> : null}
    {invites.length ? <ul className="records" style={{ marginTop: 12 }}>{invites.map(row => <li key={row.id} className="invite-row">
      <span><strong>{row.org_name}</strong> <span className="hint">{orgTypeLabels[row.org_type] ?? row.org_type} · {row.plan} · تجربة {trialLabel(row.trial_months)}</span>
        <span className="hint" style={{ display: "block" }}>أُنشئت {date(row.created_at)}{row.status === "pending" ? ` · تنتهي ${date(row.expires_at)}` : ""}{row.used_at ? ` · استُخدمت ${date(row.used_at)}` : ""}{row.note ? ` · ${row.note}` : ""}</span></span>
      <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className={`chip-soft ${row.status === "used" ? "ok" : row.status === "pending" ? "" : "rose"}`}>{inviteStatusLabels[row.status] ?? row.status}</span>
        {row.status === "used" && row.organization_id ? <Link className="btn btn-sm" href={`/admin/subscribers/${row.organization_id}`}>المنشأة</Link> : null}
        {row.status === "pending" ? <button type="button" className="btn btn-sm btn-danger" onClick={() => void revoke(row)}>إلغاء</button> : null}
        {row.status !== "used" ? <button type="button" className="btn btn-sm" onClick={() => void reissue(row)}>رابط جديد</button> : null}
      </span>
    </li>)}</ul> : <p className="empty" style={{ marginTop: 12 }}>ما فيه دعوات بعد. اضغط «ادعُ مدرسة» لإنشاء أول رابط.</p>}
  </section>;
}
