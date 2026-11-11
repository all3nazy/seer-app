"use client";
import { useState, useTransition } from "react";
import { acceptLegal } from "../app/dashboard/legal/actions";
import { Logo } from "./icons";

/** Shown to an organization's owner until they accept the current terms and privacy policy. */
export function LegalConsent({ organizationId, organizationName, updated }: { organizationId: string; organizationName: string; updated: boolean }) {
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const accept = () => start(async () => {
    setError(null);
    const result = await acceptLegal(organizationId);
    if (result.error) setError(result.error);
  });
  return <main className="shell">
    <header className="top"><Logo href="/dashboard" label="سِير" /></header>
    <section className="card login-card legal-consent" aria-labelledby="consent-title">
      <h1 id="consent-title">{updated ? "تحدّثت الشروط وسياسة الخصوصية" : "قبل البدء"}</h1>
      <p>بصفتك مالك «{organizationName}»، نحتاج موافقتك على شروط الاستخدام وسياسة الخصوصية. توضّح أن منشأتك هي جهة التحكم في بيانات طلابها وأسرهم وموظفيها، وأن سِير يعالجها نيابة عنها لتقديم الخدمة فقط.</p>
      <ul className="consent-links">
        <li><a href="/terms" target="_blank" rel="noopener noreferrer">شروط الاستخدام وملحق معالجة البيانات</a></li>
        <li><a href="/privacy" target="_blank" rel="noopener noreferrer">سياسة الخصوصية</a></li>
      </ul>
      <label className="quote-check consent-check"><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} /> قرأت شروط الاستخدام وسياسة الخصوصية وأوافق عليها نيابةً عن المنشأة.</label>
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      <button type="button" className="primary-button" disabled={!agreed || pending} onClick={accept} style={{ width: "100%" }}>{pending ? "جارٍ الحفظ…" : "موافق، تابع"}</button>
    </section>
  </main>;
}
