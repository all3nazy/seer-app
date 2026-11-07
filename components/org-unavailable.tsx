import Link from "next/link";

export function OrgUnavailable({ reason }: { reason: "load" | "none" }) {
  return reason === "load"
    ? <section className="card"><h1>تعذر تحميل المنشآت</h1><p role="alert">حاول مجددًا بعد قليل.</p><Link href="/dashboard">العودة للوحة التشغيل</Link></section>
    : <section className="card"><h1>لا توجد منشأة مرتبطة</h1><p>اطلب من مسؤول المنصة ربط حسابك بمنشأة.</p><Link href="/dashboard">العودة للوحة التشغيل</Link></section>;
}

export function OrgSwitcher({ path, current, organizations, extra }: { path: string; current: string; organizations: { id: string; name: string }[]; extra?: Record<string, string> }) {
  if (organizations.length < 2) return null;
  return <nav className="segments" aria-label="اختيار المنشأة">
    {organizations.map(item => <Link key={item.id} href={`${path}?${new URLSearchParams({ ...extra, org: item.id })}`} aria-current={item.id === current ? "page" : undefined}>{item.name}</Link>)}
  </nav>;
}
