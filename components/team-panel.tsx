"use client";
import { useRef, useState, useTransition } from "react";
import { inviteMember, removeMember, revokeInvitation, updateMember } from "../app/dashboard/team/actions";
import { invitationMessage, memberName, roleLabels, type Invitation, type Member, type Role } from "../lib/team";
import { Icon } from "./icons";
import { notify } from "./feedback";

type Props = { organizationId: string; organizationName: string; me: string; myRole: Role; members: Member[]; invitations: Invitation[] | null };

export function TeamPanel({ organizationId, organizationName, me, myRole, members, invitations }: Props) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Member | null>(null);
  const [shareText, setShareText] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const manager = myRole === "owner" || myRole === "admin";
  const run = (action: () => Promise<{ error?: string; success?: string }>, after?: () => void) => start(async () => {
    const result = await action();
    if (result.error) { notify(result.error, "error"); return; }
    notify(result.success ?? "تم", "info", "message");
    after?.();
  });
  function invite(data: FormData) {
    data.set("organization_id", organizationId);
    run(() => inviteMember(data), () => { form.current?.reset(); setShareText(invitationMessage(window.location.origin, organizationName)); });
  }
  function save(data: FormData) {
    if (!editing) return;
    data.set("organization_id", organizationId);
    data.set("user_id", editing.user_id);
    run(() => updateMember(data), () => dialog.current?.close());
  }
  function remove(member: Member) {
    if (!window.confirm(`إزالة «${memberName(member)}» من ${organizationName}؟ مهامه تصير بدون مسؤول.`)) return;
    run(() => removeMember(organizationId, member.user_id), () => dialog.current?.close());
  }
  const canEdit = (member: Member) => manager && (myRole === "owner" || member.role === "staff" || member.user_id === me);
  const sorted = [...members].sort((a, b) => ["owner", "admin", "staff"].indexOf(a.role) - ["owner", "admin", "staff"].indexOf(b.role));

  return <div className="stack">
    <section aria-labelledby="members-title">
      <h2 id="members-title" className="section-label">الأعضاء ({members.length.toLocaleString("ar-SA")})</h2>
      <ul className="list">{sorted.map(member => <li key={member.user_id} className="list-row">
        <span className="avatar" style={{ margin: 0, width: 40, height: 40, fontSize: 16 }} aria-hidden="true">{(member.display_name?.trim()[0] ?? "؟")}</span>
        <span className="body"><span className="title">{memberName(member, member.user_id === me)}</span><span className="sub">{roleLabels[member.role]}</span></span>
        {canEdit(member) ? <button type="button" className="btn btn-sm" onClick={() => { setEditing(member); requestAnimationFrame(() => dialog.current?.showModal()); }} aria-label={`تعديل ${memberName(member)}`}><Icon name="edit" />تعديل</button> : null}
      </li>)}</ul>
    </section>

    {manager ? <section aria-labelledby="invite-title">
      <h2 id="invite-title" className="section-label">دعوة عضو</h2>
      <form ref={form} action={invite} className="composer" aria-describedby="invite-help">
        <label>البريد الإلكتروني<input name="email" type="email" dir="ltr" required maxLength={254} autoComplete="off" placeholder="name@school.sa" /></label>
        <label>الاسم<input name="display_name" maxLength={80} placeholder="نورة العتيبي" /></label>
        <label>الصلاحية<select name="role" defaultValue="staff"><option value="staff">موظف</option>{myRole === "owner" ? <option value="admin">مدير</option> : null}</select></label>
        <button type="submit" className="btn-primary" disabled={pending}><Icon name="plus" />دعوة</button>
      </form>
      <p id="invite-help" className="hint" style={{ marginTop: 8 }}>الدعوة صالحة ١٤ يومًا. الشخص يفعّل حسابه بنفس البريد، وينضم للمنشأة تلقائيًا أول ما يدخل.</p>
      {shareText ? <div className="info-banner" style={{ marginTop: 12, display: "grid", gap: 10 }}>
        <span>أرسل له هذه الرسالة عشان يفعّل حسابه:</span>
        <span style={{ color: "var(--text)" }}>{shareText}</span>
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-sm" onClick={() => { void navigator.clipboard?.writeText(shareText).then(() => notify("نُسخت الرسالة")); }}>نسخ الرسالة</button>
          <a className="btn btn-sm" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer">مشاركة عبر واتساب</a>
        </span>
      </div> : null}
    </section> : <p className="info-banner">دعوة الأعضاء وتعديل صلاحياتهم لمالك المنشأة أو مديرها.</p>}

    {manager && invitations ? <section aria-labelledby="pending-title">
      <h2 id="pending-title" className="section-label">دعوات بانتظار التفعيل ({invitations.length.toLocaleString("ar-SA")})</h2>
      {invitations.length ? <ul className="list">{invitations.map(invitation => <li key={invitation.id} className="list-row">
        <span className="body"><span className="title">{invitation.display_name ?? invitation.email}</span><span className="sub" dir="ltr" style={{ textAlign: "end" }}>{invitation.email}</span></span>
        <span className="chip-soft">{roleLabels[invitation.role]}</span>
        {myRole === "owner" || invitation.role === "staff" ? <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={() => run(() => revokeInvitation(organizationId, invitation.id))}>إلغاء</button> : null}
      </li>)}</ul> : <p className="hint">ما فيه دعوات معلّقة.</p>}
    </section> : null}

    <dialog ref={dialog} aria-labelledby="member-title" onClose={() => setEditing(null)}>
      {editing ? <form key={editing.user_id} action={save} className="dialog-body">
        <h2 id="member-title">تعديل العضو</h2>
        <label>الاسم<input name="display_name" maxLength={80} defaultValue={editing.display_name ?? ""} /></label>
        {myRole === "owner" && editing.user_id !== me ? <label>الصلاحية<select name="role" defaultValue={editing.role}>
          <option value="staff">موظف</option><option value="admin">مدير</option><option value="owner">مالك</option>
        </select></label> : null}
        <div className="dialog-actions">
          {editing.user_id !== me && (myRole === "owner" || editing.role === "staff") ? <button type="button" className="btn btn-danger" disabled={pending} onClick={() => remove(editing)}>إزالة من المنشأة</button> : <span />}
          <div><button type="button" className="btn" onClick={() => dialog.current?.close()}>إلغاء</button><button type="submit" className="btn-primary" disabled={pending}>حفظ</button></div>
        </div>
      </form> : null}
    </dialog>
  </div>;
}
