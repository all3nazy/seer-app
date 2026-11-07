import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { supportLink } from "../../../lib/support";
import { Icon } from "../../../components/icons";
import { SoundSwitchRow, ThemeSwitchRow } from "../../../components/preferences";
import SignOutButton from "../../../components/sign-out-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "الإعدادات" };
const roleNames: Record<string, string> = { owner: "مالك", admin: "مدير", staff: "موظف" };

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  const { data: memberships } = await supabase.from("memberships").select("organization_id,role,organizations(name)").eq("user_id", user.id);
  const support = supportLink(process.env.SEER_SUPPORT_WHATSAPP ?? "");
  const email = user.email ?? "";
  return <div style={{ maxWidth: 640 }}>
    <header className="page-head"><div><h1>الإعدادات</h1><p>حسابك وتفضيلات الواجهة.</p></div></header>
    <div className="stack">
      <div className="list-row"><span className="avatar" style={{ margin: 0, width: 48, height: 48, fontSize: 18 }} aria-hidden="true">{(email[0] ?? "س").toUpperCase()}</span>
        <span className="body"><span className="title" dir="ltr" style={{ textAlign: "end" }}>{email}</span><span className="sub">{(memberships ?? []).map(m => `${(m.organizations as unknown as { name: string } | null)?.name ?? "منشأة"} (${roleNames[m.role] ?? "عضو"})`).join("، ") || "غير مرتبط بمنشأة"}</span></span></div>
      <section aria-labelledby="general"><h2 id="general" className="section-label">الإعدادات العامة</h2>
        <div className="group"><ThemeSwitchRow /><SoundSwitchRow /></div>
        <p className="hint" style={{ marginTop: 8 }}>تنحفظ هذي التفضيلات في متصفحك فقط.</p>
      </section>
      <section aria-labelledby="help"><h2 id="help" className="section-label">المساعدة</h2>
        <div className="group">
          {support ? <a className="group-row" href={support} target="_blank" rel="noopener noreferrer"><span className="tile-icon tone-sun"><Icon name="help" /></span><span className="grow">الدعم عبر واتساب</span><Icon name="arrowNext" /></a>
            : <div className="group-row"><span className="tile-icon tone-sun"><Icon name="help" /></span><span className="grow">الدعم عبر واتساب</span><span className="hint">قيد الإعداد</span></div>}
          <a className="group-row" href="/auth/activate"><span className="tile-icon tone-leaf"><Icon name="check" /></span><span className="grow">تفعيل حساب أو إعادة إرسال الرابط</span><Icon name="arrowNext" /></a>
        </div>
      </section>
      <div><SignOutButton /></div>
    </div>
  </div>;
}
