"use client";
import { useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { loginEmail } from "../lib/login";
import { signIn } from "../app/login/actions";
import { useTurnstile } from "./turnstile";

const errors: Record<string, string> = {
  "23505": "اسم المستخدم محجوز، أو أنت عضو في المنشأة من قبل. جرّب اسمًا آخر.",
  "22023": "اسم المستخدم من ٣ إلى ٣٠ حرفًا إنجليزيًا أو رقمًا، وكلمة المرور ٨ أحرف على الأقل فيها حروف وأرقام.",
  P0002: "انتهت صلاحية الرابط. اطلب رابطًا جديدًا من إدارتك.",
};
export function JoinForm({ code, signedIn, suggestedName }: { code: string; signedIn: boolean; suggestedName: string }) {
  const [name, setName] = useState(suggestedName);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const captcha = useTurnstile("join");
  async function join(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    const client = getSupabaseBrowserClient();
    const { data, error: joinError } = await client.rpc("join_with_code", signedIn ? { link: code, name } : { link: code, login: login.trim(), password, name });
    if (joinError) { setError(errors[joinError.code ?? ""] ?? "تعذر الانضمام. حاول مرة ثانية."); setBusy(false); return; }
    if (!signedIn) {
      // The new account signs in on the server (lock check, captcha, attempt recorded).
      const result = await signIn(String(data ?? loginEmail(login)), password, await captcha.getToken()).catch(() => null);
      captcha.reset();
      if (!result?.ok) { window.location.assign("/login"); return; }
    }
    window.location.assign("/dashboard/my");
  }
  return <form method="post" onSubmit={join} className="login-form" aria-busy={busy}>
    <label htmlFor="join-name">اسمك كما يظهر لزملائك</label>
    <input id="join-name" value={name} onChange={event => setName(event.target.value)} maxLength={80} required />
    {signedIn ? null : <>
      <label htmlFor="join-login">اسم المستخدم (أو بريدك)</label>
      <input id="join-login" dir="ltr" value={login} onChange={event => setLogin(event.target.value)} required autoCapitalize="none" spellCheck={false} autoComplete="username" placeholder="huda.t" maxLength={254} />
      <label htmlFor="join-password">كلمة المرور</label>
      <input id="join-password" type="password" dir="ltr" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} autoComplete="new-password" />
      <p className="hint" style={{ margin: 0 }}>٨ أحرف على الأقل، فيها حروف وأرقام. احفظ اسم المستخدم؛ تدخل فيه كل مرة.</p>
    </>}
    {signedIn ? null : captcha.widget}
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    <button type="submit" className="primary-button" disabled={busy}>{busy ? "جارٍ الانضمام…" : signedIn ? "انضم بحسابي الحالي" : "انضم وادخل"}</button>
  </form>;
}
