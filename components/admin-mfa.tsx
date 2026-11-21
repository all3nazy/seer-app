"use client";
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { mfaStep, normalizeCode, type MfaFactor } from "../lib/admin-gate";

type View =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "enroll"; factorId: string; qr: string; secret: string }
  | { kind: "challenge"; factorId: string };

/**
 * Supabase MFA (TOTP) for «سِير أدمن»: the first time, a QR code and the secret to type by hand,
 * confirmed with a six-digit code; afterwards a six-digit code each sign-in. A correct code turns
 * the session into aal2, which the console and the database require.
 */
export function AdminMfa() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const auth = getSupabaseBrowserClient().auth;
    void (async () => {
      try {
        const [{ data: level }, { data: factors, error: listError }] = await Promise.all([auth.mfa.getAuthenticatorAssuranceLevel(), auth.mfa.listFactors()]);
        if (listError) throw listError;
        const step = mfaStep(((factors?.all ?? []) as MfaFactor[]), level?.currentLevel);
        if (step.kind === "done") { window.location.assign("/admin"); return; }
        if (step.kind === "challenge") { setView({ kind: "challenge", factorId: step.factorId }); return; }
        for (const id of step.stale) await auth.mfa.unenroll({ factorId: id });
        const { data, error: enrollError } = await auth.mfa.enroll({ factorType: "totp", friendlyName: `سِير أدمن ${new Date().toISOString().slice(0, 10)}` });
        if (enrollError || !data) throw enrollError ?? new Error("enroll");
        setView({ kind: "enroll", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      } catch {
        setView({ kind: "error", message: "تعذر تجهيز التحقق الثنائي. حدّث الصفحة، وإذا تكرر اخرج وادخل من جديد." });
      }
    })();
  }, []);
  useEffect(() => { if (view.kind === "enroll" || view.kind === "challenge") field.current?.focus(); }, [view.kind]);

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || (view.kind !== "enroll" && view.kind !== "challenge")) return;
    const value = normalizeCode(code);
    if (!value) { setError("اكتب الرمز المكوّن من ٦ أرقام."); return; }
    setBusy(true); setError("");
    const { error: verifyError } = await getSupabaseBrowserClient().auth.mfa.challengeAndVerify({ factorId: view.factorId, code: value });
    if (verifyError) {
      setBusy(false); setCode("");
      setError(/rate|too many|429/i.test(verifyError.message) ? "محاولات كثيرة. انتظر شوي ثم حاول." : "الرمز غير صحيح أو انتهت مدته. اكتب الرمز الحالي من التطبيق.");
      field.current?.focus();
      return;
    }
    window.location.assign("/admin");
  }

  if (view.kind === "loading") return <p aria-busy="true" role="status">جارٍ تجهيز التحقق الثنائي…</p>;
  if (view.kind === "error") return <p role="alert" className="form-error">{view.message}</p>;
  const enrolling = view.kind === "enroll";
  return <>
    <h1 id="verify-title" style={{ margin: 0, fontSize: 22 }}>{enrolling ? "فعّل التحقق الثنائي" : "التحقق الثنائي"}</h1>
    {enrolling ? <>
      <p style={{ margin: 0 }}>الدخول للوحة المالك يحتاج تطبيق تحقق على جوالك (مثل Google Authenticator أو Microsoft Authenticator). امسح الرمز، ثم اكتب الأرقام الستة اللي تطلع لك.</p>
      <div className="adm-qr"><img src={view.qr} alt="رمز QR لإضافة سِير أدمن في تطبيق التحقق" width={200} height={200} /></div>
      <p className="hint" style={{ margin: 0 }}>ما تقدر تمسح؟ اكتب هذا المفتاح في التطبيق يدويًا:</p>
      <p className="adm-secret" dir="ltr" aria-label="المفتاح السري للتحقق">{view.secret}</p>
    </> : <p style={{ margin: 0 }}>افتح تطبيق التحقق على جوالك واكتب الرمز الحالي لـ«سِير أدمن».</p>}
    <form method="post" onSubmit={verify} className="login-form" aria-busy={busy}>
      <label htmlFor="mfa-code">الرمز المكوّن من ٦ أرقام</label>
      <input ref={field} id="mfa-code" className="adm-code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={12} required value={code} onChange={event => setCode(event.target.value)} readOnly={busy} aria-describedby={error ? "mfa-error" : undefined} />
      {error ? <p id="mfa-error" role="alert" className="form-error">{error}</p> : null}
      <button type="submit" className="primary-button" disabled={busy}>{busy ? "جارٍ التحقق…" : enrolling ? "فعّل وادخل" : "تحقق وادخل"}</button>
    </form>
  </>;
}
