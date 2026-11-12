import Link from "next/link";
import { redirect } from "next/navigation";
import { requestMyOrganizations, requestSession } from "../../../lib/supabase/server";
import { SettingsTabs } from "../../../components/settings-tabs";
import { pilotHiddenFeatures, pilotHides, pilotMode } from "../../../lib/pilot";
import { featureKeys } from "../../../lib/subscriptions";
import { supportHome, supportLink } from "../../../lib/support";
import { Icon } from "../../../components/icons";
import { SoundSwitchRow, ThemeSwitchRow } from "../../../components/preferences";
import SignOutButton from "../../../components/sign-out-button";
import { MyNameForm } from "../../../components/my-name-form";
import { MyPhoneForm } from "../../../components/my-phone-form";
import { cookies } from "next/headers";
import { InstallCard, IconPicker } from "../../../components/install-app";
import { ChangePassword } from "../../../components/change-password";
import { PushToggle } from "../../../components/notifications";
import { OrgCustomizer } from "../../../components/org-customizer";
import type { MyOrg } from "../../../lib/subscriptions";
import { iconCookie, parseIconChoice } from "../../../lib/app-icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "الإعدادات" };
const roleNames: Record<string, string> = { owner: "مالك", admin: "مدير", staff: "موظف" };

export default async function SettingsPage() {
  const { client: supabase, user } = await requestSession();
  if (!user) redirect("/login");
  const { data: memberships } = await supabase.from("memberships").select("organization_id,role,display_name,organizations(name)").eq("user_id", user.id);
  const myName = (memberships ?? []).map(m => (m as { display_name?: string | null }).display_name).find(Boolean) ?? "";
  const { data: phones } = await supabase.from("member_phones").select("phone").eq("user_id", user.id).limit(1);
  const myPhone = phones?.[0]?.phone ?? "";
  const { data: ticketRows } = await supabase.from("support_threads").select("id,subject,status,last_sender").eq("user_id", user.id).order("status", { ascending: false }).order("last_message_at", { ascending: false }).limit(5);
  const tickets = (ticketRows ?? []) as { id: string; subject: string; status: string; last_sender: string }[];
  const email = user.email ?? "";
  const icon = parseIconChoice((await cookies()).get(iconCookie)?.value).choice;
  const myOrganizations = (await requestMyOrganizations()).data;
  const pilot = pilotMode();
  const owned = myOrganizations.filter(org => org.role === "owner");
  const manager = myOrganizations.some(org => org.role === "owner" || org.role === "admin");
  return <div style={{ maxWidth: 640 }}>
    <header className="page-head"><div><h1>الإعدادات</h1><p>حسابك وتفضيلات الواجهة.</p></div></header>
    <SettingsTabs tabs={[
      { id: "account", label: "حسابي", content: <>
      <div className="list-row"><span className="avatar" style={{ margin: 0, width: 48, height: 48, fontSize: 18 }} aria-hidden="true">{(email[0] ?? "س").toUpperCase()}</span>
        <span className="body"><span className="title" dir="ltr" style={{ textAlign: "end" }}>{email.endsWith("@users.seer.local") ? email.split("@")[0] : email}</span><span className="sub">{(memberships ?? []).map(m => `${(m.organizations as unknown as { name: string } | null)?.name ?? "منشأة"} (${roleNames[m.role] ?? "عضو"})`).join("، ") || "غير مرتبط بمنشأة"}</span></span></div>
      <section aria-labelledby="me" id="me-section"><h2 id="me" className="section-label">اسمك في المنشأة</h2>
        <MyNameForm current={myName} />
        <p className="hint" style={{ marginTop: 8 }}>يظهر لزملائك في الفريق وعلى المهام المسندة لك.</p>
      </section>
      <section aria-labelledby="phone"><h2 id="phone" className="section-label">جوالك لاستلام المهام</h2>
        <MyPhoneForm current={myPhone} />
        <p className="hint" style={{ marginTop: 8 }}>تستخدمه الإدارة لإرسال المهام لك على واتساب. ما يظهر لزملائك.</p>
      </section>
      <section aria-labelledby="password-title"><h2 id="password-title" className="section-label">كلمة المرور</h2>
        <ChangePassword />
      </section>
      <div><SignOutButton /></div>
      </> },
      ...(manager ? [{ id: "organization" as const, label: "المنشأة", content: <>
      {owned.map(org => <section key={org.organization_id} aria-labelledby={`sections-${org.organization_id}`} id="sections"><h2 id={`sections-${org.organization_id}`} className="section-label">أقسام وهوية {org.name}</h2>
        <OrgCustomizer organizationId={org.organization_id} features={pilot ? featureKeys.filter(key => !pilotHides(key)) : org.features ?? []} disabled={org.disabled_features ?? []} primary={org.primary_color} accent={org.accent_color} hidden={pilot ? [...pilotHiddenFeatures] : []} />
      </section>)}
      {owned.length ? null : <p className="info-banner" style={{ margin: 0 }}>الأقسام وألوان الهوية يعدّلها مالك المنشأة.</p>}
      <section aria-labelledby="team-link" id="team"><h2 id="team-link" className="section-label">الفريق</h2>
        <div className="group"><a className="group-row" href="/dashboard/team"><span className="tile-icon tone-plum"><Icon name="users" /></span><span className="grow">أعضاء المنشأة والدعوات</span><Icon name="arrowNext" /></a></div>
      </section>
      </> }] : []),
      { id: "device", label: "الجهاز والإشعارات", content: <>
      <section aria-labelledby="notify-title" id="notify"><h2 id="notify-title" className="section-label">الإشعارات</h2>
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <p style={{ margin: 0 }}>يوصلك إشعار على هذا الجهاز لما تنسند لك مهمة، أو يردّون على استفسارك، أو تنحسم إجازتك. وللمدير: الاستفسارات وطلبات الإجازة والالتحاق وإشعارات الغياب والدفعات.</p>
          <PushToggle />
        </div>
      </section>
      <section aria-labelledby="app" id="app"><h2 id="app-title" className="section-label">سِير على جهازك</h2>
        <div className="card" style={{ display: "grid", gap: 14 }}>
          <p style={{ margin: 0 }}>ثبّت سِير على الكمبيوتر أو الجوال أو الآيباد، ويفتح مثل التطبيق في نافذته الخاصة بأيقونته على الشاشة الرئيسية.</p>
          <InstallCard />
          <h3 style={{ margin: "6px 0 0", fontSize: 16 }}>أيقونة التطبيق</h3>
          <IconPicker initial={icon} />
          <p className="hint" style={{ margin: 0 }}>إذا كان سِير مثبّتًا: على الكمبيوتر وأندرويد تتحدّث الأيقونة تلقائيًا خلال يوم، وعلى الآيفون والآيباد احذف الأيقونة من الشاشة الرئيسية وأضفها مرة ثانية.</p>
        </div>
      </section>
      <section aria-labelledby="general" id="general-section"><h2 id="general" className="section-label">الإعدادات العامة</h2>
        <div className="group"><ThemeSwitchRow /><SoundSwitchRow /></div>
        <p className="hint" style={{ marginTop: 8 }}>تنحفظ هذي التفضيلات في متصفحك فقط.</p>
      </section>
      </> },
      { id: "help", label: "المساعدة", content: <>
      <section aria-labelledby="help"><h2 id="help" className="section-label">المساعدة</h2>
        <p className="hint" style={{ marginTop: 0 }}>اسأل المساعد أولًا، يشرح لك أي قسم خطوة بخطوة. وإذا ما لقيت جوابك، كلّم فريق سِير من هنا ويرد عليك داخل المنصة.</p>
        {tickets.length ? <div className="group" style={{ marginBottom: 12 }}>{tickets.map(ticket => <Link key={ticket.id} className="group-row" href={`/dashboard/support/${ticket.id}`}>
          <span className="tile-icon tone-plum"><Icon name="chat" /></span><span className="grow">{ticket.subject}</span>
          <span className={`chip-soft ${ticket.status === "closed" ? "" : ticket.last_sender === "admin" ? "ok" : "coral"}`}>{ticket.status === "closed" ? "مغلقة" : ticket.last_sender === "admin" ? "وصلك رد" : "بانتظار الفريق"}</span></Link>)}</div> : null}
        <div className="group">
          <Link className="group-row" href={supportLink("/dashboard/settings")}><span className="tile-icon tone-sun"><Icon name="help" /></span><span className="grow">تكلّم مع فريق سِير</span><Icon name="arrowNext" /></Link>
          <Link className="group-row" href={supportHome}><span className="tile-icon tone-plum"><Icon name="chat" /></span><span className="grow">كل تذاكري</span><Icon name="arrowNext" /></Link>
          <a className="group-row" href="/auth/activate"><span className="tile-icon tone-leaf"><Icon name="check" /></span><span className="grow">تفعيل حساب أو إعادة إرسال الرابط</span><Icon name="arrowNext" /></a>
        </div>
      </section>
      </> },
    ]} />
  </div>;
}
