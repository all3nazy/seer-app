"use client";
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../../../lib/supabase";
import { verifySetupSession } from "../../../lib/auth-setup";

export default function AccountSetup() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const notice = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const verified = await verifySetupSession(getSupabaseBrowserClient, new URL(window.location.href), path => window.history.replaceState(null, "", path));
        if (!active) return;
        if (!verified) setMessage("رابط الدعوة غير صالح أو انتهت صلاحيته. اطلب دعوة جديدة من مسؤول المنصة.");
        else setReady(true);
      } catch { if (active) setMessage("تعذر التحقق من الدعوة. حاول مجددًا لاحقًا."); }
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => { if (message) notice.current?.focus(); }, [message]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 12 || password !== confirmation) {
      setMessage("استخدم كلمة مرور من ١٢ حرفًا على الأقل، وتأكد من تطابق الحقلين."); return;
    }
    setBusy(true); setMessage("");
    try {
      const { error } = await getSupabaseBrowserClient().auth.updateUser({ password });
      if (error) { setMessage("تعذر تعيين كلمة المرور. تحقق من صلاحية الدعوة ومتطلبات كلمة المرور."); return; }
      window.location.assign("/dashboard");
    } catch { setMessage("تعذر الاتصال بالخدمة. حاول مجددًا."); }
    finally { setBusy(false); }
  }
  return <main className="shell" id="main-content"><a href="/" className="logo">سِير.</a><section className="card" style={{maxWidth:480,margin:"40px auto"}}><h1>إعداد حسابك</h1><p>عيّن كلمة مرور خاصة بك. ربط الحساب بالمنشأة يتم بواسطة مسؤول المنصة.</p>
    {message&&<p ref={notice} tabIndex={-1} role="alert">{message}</p>}
    {!ready&&!message&&<p role="status">جارٍ التحقق من الدعوة…</p>}
    {ready&&<form onSubmit={save} aria-busy={busy} className="operation-form"><label>كلمة المرور الجديدة<input dir="ltr" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></label><label>تأكيد كلمة المرور<input dir="ltr" type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={e=>setConfirmation(e.target.value)} disabled={busy}/></label><button disabled={busy}>{busy?"جارٍ الحفظ…":"حفظ كلمة المرور"}</button></form>}
    <p><a href="/login">العودة لتسجيل الدخول</a></p>
  </section></main>;
}
