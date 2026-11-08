"use client";
import { useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { notify } from "./feedback";

/** Change your own password while signed in; no email is needed. */
export function ChangePassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8 || !/\d/.test(password) || !/\D/.test(password)) { notify("كلمة المرور ٨ أحرف على الأقل وفيها حروف وأرقام.", "error"); return; }
    if (password !== confirm) { notify("التأكيد لا يطابق كلمة المرور.", "error"); return; }
    setBusy(true);
    const { error } = await getSupabaseBrowserClient().auth.updateUser({ password });
    setBusy(false);
    if (error) { notify("تعذر التغيير. سجّل الدخول من جديد ثم حاول.", "error"); return; }
    setPassword(""); setConfirm("");
    notify("تغيّرت كلمة المرور.", "info", "done");
  }
  return <form method="post" onSubmit={save} className="composer">
    <label>كلمة المرور الجديدة<input type="password" dir="ltr" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
    <label>تأكيدها<input type="password" dir="ltr" value={confirm} onChange={event => setConfirm(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
    <button type="submit" className="btn-primary" disabled={busy}>{busy ? "جارٍ الحفظ…" : "تغيير كلمة المرور"}</button>
  </form>;
}
