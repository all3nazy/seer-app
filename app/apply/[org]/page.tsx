import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { uuid } from "../../../lib/operations";
import { Logo } from "../../../components/icons";
import { ApplyForm } from "../../../components/apply-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "طلب التحاق", robots: { index: false } };
type Form = { name: string; intro: string | null; grades: { id: string; name: string }[] } | null;

export default async function ApplyPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: raw } = await params;
  let org: string;
  try { org = uuid(raw); } catch { notFound(); }
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("admission_form", { org });
  const form = data as Form;
  return <main className="shell">
    <header className="top"><Logo /></header>
    <section className="card login-card" id="main-content" tabIndex={-1} aria-labelledby="apply-title" style={{ maxWidth: 560 }}>
      {error ? <><h1 id="apply-title">طلب التحاق</h1><p role="alert">تعذر تحميل النموذج حاليًا. حاول بعد قليل.</p></>
        : !form ? <><h1 id="apply-title">التقديم مغلق</h1><p>هذه المنشأة لا تستقبل طلبات التحاق إلكترونية حاليًا. تواصل معها مباشرة.</p><p><a href="/apply/status">متابعة طلب سابق</a></p></>
        : <>
          <h1 id="apply-title">طلب التحاق — {form.name}</h1>
          {form.intro ? <p style={{ whiteSpace: "pre-wrap" }}>{form.intro}</p> : <p>عبّ البيانات وبنتواصل معك بعد مراجعة الطلب.</p>}
          <ApplyForm organizationId={org} grades={form.grades ?? []} />
          <p className="login-help"><a href="/apply/status">عندك طلب سابق؟ تابع حالته</a></p>
        </>}
    </section>
  </main>;
}
