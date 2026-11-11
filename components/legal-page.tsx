import Link from "next/link";
import { Logo } from "./icons";
import { LEGAL_UPDATED, LEGAL_VERSION, type LegalDocument } from "../lib/legal";

/** A legal document page: title, last update, contents, sections, and the link to the other document. */
export function LegalPage({ doc, other }: { doc: LegalDocument; other: { href: string; label: string } }) {
  return <><a className="skip-link" href="#main-content">تجاوز إلى المحتوى</a><main className="shell legal">
    <header className="top"><Logo /><nav aria-label="التنقل الرئيسي" style={{ display: "flex", gap: 8 }}><Link className="btn" href={other.href}>{other.label}</Link><Link className="btn" href="/login">تسجيل الدخول</Link></nav></header>
    <article className="card legal-doc" id="main-content" tabIndex={-1} aria-labelledby="legal-title">
      <h1 id="legal-title">{doc.title}</h1>
      <p className="hint">آخر تحديث: {LEGAL_UPDATED} · النسخة <span dir="ltr">{LEGAL_VERSION}</span></p>
      <p>{doc.intro}</p>
      <nav aria-label="المحتويات" className="legal-toc"><ol>{doc.sections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ol></nav>
      {doc.sections.map(section => <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`}>
        <h2 id={`${section.id}-title`}>{section.title}</h2>
        {section.paragraphs?.map((text, index) => <p key={index}>{text}</p>)}
        {section.items ? <ul>{section.items.map((text, index) => <li key={index}>{text}</li>)}</ul> : null}
      </section>)}
    </article>
    <LegalFooter />
  </main></>;
}

/** Links to the legal pages, for the footer of public pages and the family portal. */
export function LegalFooter() {
  return <footer className="foot legal-links">سِير، منصة إدارة عمليات المدارس والحضانات. · <Link href="/privacy">سياسة الخصوصية</Link> · <Link href="/terms">شروط الاستخدام</Link></footer>;
}
