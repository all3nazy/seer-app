import { redirect } from "next/navigation";
import { createSupabaseServerClient, sessionUser } from "../../../lib/supabase/server";
import { supportLink } from "../../../lib/support";
import { Icon } from "../../../components/icons";
import { SoundSwitchRow, ThemeSwitchRow } from "../../../components/preferences";
import SignOutButton from "../../../components/sign-out-button";
import { MyNameForm } from "../../../components/my-name-form";
import { MyPhoneForm } from "../../../components/my-phone-form";
import { cookies } from "next/headers";
import { InstallCard, IconPicker } from "../../../components/install-app";
import { iconCookie, parseIconChoice } from "../../../lib/app-icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "الإعدادات" };
const roleNames: Record<string, string> = { owner: "مالك", admin: "مدير", staff: "موظف" };

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const user = await sessionUser(supabase);
  if (!user) redirect("/login");
  const { data: memberships } = await supabase.from("memberships").select("organization_id,role,display_name,organizations(name)").eq("user_id", user.id);
  const myName = (memberships ?? []).map(m => (m as { display_name?: string | null }).display_name).find(Boolean) ?? "";
  const { data: phones } = await supabase.from("member_phones").select("phone").eq("user_id", user.id).limit(1);
  const myPhone = phones?.[0]?.phone ?? "";
  const support = supportLink(process.env.SEER_SUPPORT_WHATSAPP ?? "");
  const email = user.email ?? "";
  const icon = parseIconChoice((await cookies()).get(iconCookie)?.value).choice;
  return <div style={{ maxWidth: 640 }}>
    <header className="page-head"><div><h1>الإعدادات</h1><p>حسابك وتفضيلات الواجهة.</p></div></header>
    <div className="stack">
      <div className="list-row"><span className="avatar" style={{ margin: 0, width: 48, height: 48, fontSize: 18 }} aria-hidden="true">{(email[0] ?? "س").toUpperCase()}</span>
        <span className="body"><span className="title" dir="ltr" style={{ textAlign: "end" }}>{email}</span><span className="sub">{(memberships ?? []).map(m => `${(m.organizations as unknown as { name: string } | null)?.name ?? "منشأة"} (${roleNames[m.role] ?? "عضو"})`).join("، ") || "غير مرتبط بمنشأة"}</span></span></div>
      <section aria-labelledby="app" id="app"><h2 id="app-title" className="section-label">سِير على جهازك</h2>
        <div className="card" style={{ display: "grid", gap: 14 }}>
          <p style={{ margin: 0 }}>ثبّت سِير على الكمبيوتر أو الجوال أو الآيباد، ويفتح مثل التطبيق في نافذته الخاصة بأيقونته على الشاشة الرئيسية.</p>
          <InstallCard />
          <h3 style={{ margin: "6px 0 0", fontSize: 16 }}>أيقونة التطبيق</h3>
          <IconPicker initial={icon} />
          <p className="hint" style={{ margin: 0 }}>إذا كان سِير مثبّتًا: على الكمبيوتر وأندرويد تتحدّث الأيقونة تلقائيًا خلال يوم، وعلى الآيفون والآيباد احذف الأيقونة من الشاشة الرئيسية وأضفها مرة ثانية.</p>
        </div>
      </section>
      <section aria-labelledby="me"><h2 id="me" className="section-label">اسمك في المنشأة</h2>
        <MyNameForm current={myName} />
        <p className="hint" style={{ marginTop: 8 }}>يظهر لزملائك في الفريق وعلى المهام المسندة لك.</p>
      </section>
      <section aria-labelledby="phone"><h2 id="phone" className="section-label">جوالك لاستلام المهام</h2>
        <MyPhoneForm current={myPhone} />
        <p className="hint" style={{ marginTop: 8 }}>تستخدمه الإدارة لإرسال المهام لك على واتساب. ما يظهر لزملائك.</p>
      </section>
      <section aria-labelledby="team-link"><h2 id="team-link" className="section-label">الفريق</h2>
        <div className="group"><a className="group-row" href="/dashboard/team"><span className="tile-icon tone-plum"><Icon name="users" /></span><span className="grow">أعضاء المنشأة والدعوات</span><Icon name="arrowNext" /></a></div>
      </section>
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
