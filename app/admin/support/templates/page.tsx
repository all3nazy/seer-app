import { requestSession } from "../../../../lib/supabase/server";
import { BackLink } from "../../../../components/back-link";
import { SupportTemplatesEditor } from "../../../../components/support-templates";
import { siteBase } from "../../../../lib/telegram";
import type { SupportTemplate } from "../../../../lib/support-templates";

export const dynamic = "force-dynamic";
export const metadata = { title: "قوالب الرد" };

/** Ready replies for support: add, edit, order and turn off. Used in tickets here and in Telegram. */
export default async function SupportTemplatesPage() {
  const { client } = await requestSession();
  const { data, error } = await client.rpc("admin_support_templates");
  return <div style={{ maxWidth: 860 }}>
    <BackLink href="/admin/support" label="رجوع إلى التذاكر" />
    <header className="page-head"><div><h1>قوالب الرد</h1><p>ردود جاهزة تدرجها في التذكرة أو ترسلها من تيليقرام بزر «قوالب الرد». الصفحة تتحول لرابط كامل وقت الإرسال.</p></div></header>
    {error ? <p className="info-banner" role="alert">تعذر تحميل القوالب. حدّث الصفحة.</p> : <SupportTemplatesEditor templates={(data ?? []) as SupportTemplate[]} site={siteBase(process.env, "")} />}
  </div>;
}
