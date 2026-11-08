"use client";
import { useEffect, useState } from "react";
import { reportError, selfHealing } from "../lib/error-report";

/** Any page error: logged, healed when possible, and explained with the known fix if one exists. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [fix, setFix] = useState<string | null>(null);
  useEffect(() => {
    if (selfHealing(error) === "reload") {
      try { if (sessionStorage.getItem("seer-healed") !== location.pathname) { sessionStorage.setItem("seer-healed", location.pathname); location.reload(); return; } } catch { /* ignore */ }
    }
    void reportError(error).then(setFix);
  }, [error]);
  return <section className="card" role="alert" style={{ maxWidth: 560, margin: "40px auto", display: "grid", gap: 12 }}>
    <h1 style={{ fontSize: 20, margin: 0 }}>صار خطأ غير متوقع</h1>
    <p style={{ margin: 0 }}>انحفظ الخطأ تلقائيًا عشان يتراجع ويتصلح. بياناتك سليمة.</p>
    {fix ? <p className="info-banner" style={{ margin: 0 }}>💡 {fix}</p> : null}
    <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" className="btn btn-primary" onClick={reset}>إعادة المحاولة</button>
      <a className="btn" href="/dashboard">لوحة التشغيل</a>
    </span>
    {error.digest ? <small className="hint" dir="ltr">ref: {error.digest}</small> : null}
  </section>;
}
