import Link from "next/link";
import { Icon } from "../../../components/icons";
import SignOutButton from "../../../components/sign-out-button";
import { navLinks } from "../../../lib/navigation";

export const metadata = { title: "المزيد" };

/** All sections. On a phone only the daily ones show; tablets and computers see everything. */
export default function MorePage() {
  const items = navLinks.filter(link => !link.tab);
  return <div style={{ maxWidth: 640 }}>
    <header className="page-head"><div><h1>المزيد</h1><p>كل الأقسام. على الجوال تظهر أقسام العمل اليومي، والباقي على الكمبيوتر أو الآيباد.</p></div></header>
    <div className="group">
      {items.map(link => <Link key={link.href} className={`group-row${link.phone ? "" : " desktop-only"}`} href={link.href}>
        <span className="tile-icon tone-plum"><Icon name={link.icon} /></span><span className="grow">{link.label}</span><Icon name="arrowNext" />
      </Link>)}
    </div>
    <p className="hint phone-only-block" style={{ marginTop: 12 }}>المالية والقبول والهيكل الدراسي والفريق والسجلات وسجل التدقيق ولوحة المهام متاحة على الكمبيوتر أو الآيباد.</p>
    <div style={{ marginTop: 24 }}><SignOutButton /></div>
  </div>;
}
