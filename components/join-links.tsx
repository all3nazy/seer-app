"use client";
import { useState, useTransition } from "react";
import { createJoinLink, resetMemberPassword, revokeJoinLink } from "../app/dashboard/team/actions";
import { whatsappLink } from "../lib/share";
import { notify } from "./feedback";

export type JoinLink = { code: string; role: string; display_name: string | null; uses: number; max_uses: number; expires_at: string };
const roleLabel = (role: string) => role === "admin" ? "مدير" : "موظف";
const message = (organization: string, link: string, name: string | null) =>
  `السلام عليكم${name ? ` ${name}` : ""}، هذا رابط انضمامك لفريق ${organization} على منصة سِير. افتحه واختر اسم مستخدم وكلمة مرور: ${link}`;

/** Creates a join link and offers it for WhatsApp or copying. */
export function JoinLinkCreator({ organizationId, organizationName, canInviteAdmins }: { organizationId: string; organizationName: string; canInviteAdmins: boolean }) {
  const [pending, start] = useTransition();
  const [role, setRole] = useState("staff");
  const [name, setName] = useState("");
  const [uses, setUses] = useState(1);
  const [link, setLink] = useState<string | null>(null);
  const create = () => start(async () => {
    const result = await createJoinLink(organizationId, role, name, uses);
    notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info", result.error ? undefined : "done");
    if (result.link) setLink(result.link);
  });
  return <div style={{ display: "grid", gap: 12 }}>
    <div className="composer">
      <label>اسم الموظف (اختياري)<input value={name} onChange={event => setName(event.target.value)} maxLength={80} placeholder="أ. هدى" /></label>
      <label>الدور<select value={role} onChange={event => setRole(event.target.value)}><option value="staff">موظف / معلم</option>{canInviteAdmins ? <option value="admin">مدير</option> : null}</select></label>
      <label>عدد مرات الاستخدام<input type="number" min={1} max={50} value={uses} onChange={event => setUses(Number(event.target.value))} /></label>
      <button type="button" className="btn-primary" disabled={pending} onClick={create}>{pending ? "جارٍ الإنشاء…" : "إنشاء رابط انضمام"}</button>
    </div>
    {link ? <div className="info-banner" style={{ display: "grid", gap: 8 }}>
      <code dir="ltr" style={{ wordBreak: "break-all" }}>{link}</code>
      <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a className="btn btn-sm btn-primary" href={whatsappLink(null, message(organizationName, link, name.trim() || null))} target="_blank" rel="noopener noreferrer">إرسال واتساب</a>
        <button type="button" className="btn btn-sm" onClick={() => { void navigator.clipboard?.writeText(link); notify("نُسخ الرابط.", "info", "done"); }}>نسخ</button>
      </span>
    </div> : null}
  </div>;
}

export function JoinLinkList({ organizationId, links, origin }: { organizationId: string; links: JoinLink[]; origin: string }) {
  const [pending, start] = useTransition();
  if (!links.length) return null;
  return <ul className="records" style={{ marginTop: 12 }}>{links.map(item => <li key={item.code} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
    <span>{item.display_name ?? "رابط عام"} · {roleLabel(item.role)}<span className="hint" style={{ display: "block" }} dir="ltr">{origin}/j/{item.code} · {item.uses}/{item.max_uses}</span></span>
    <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={() => start(async () => { const result = await revokeJoinLink(organizationId, item.code); notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info"); })}>إلغاء</button>
  </li>)}</ul>;
}

/** A manager sets a new password for a member who forgot theirs. */
export function ResetPassword({ organizationId, memberId, memberName }: { organizationId: string; memberId: string; memberName: string }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  if (!open) return <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>كلمة مرور جديدة</button>;
  return <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
    <input aria-label={`كلمة مرور جديدة لـ${memberName}`} dir="ltr" value={password} onChange={event => setPassword(event.target.value)} minLength={8} style={{ width: 160 }} />
    <button type="button" className="btn btn-sm btn-primary" disabled={pending} onClick={() => start(async () => { const result = await resetMemberPassword(organizationId, memberId, password); notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info"); if (!result.error) { setOpen(false); setPassword(""); } })}>حفظ</button>
    <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>إلغاء</button>
  </span>;
}
