import Link from "next/link";
import { adminRoleLabels, type AdminRole } from "../lib/admin-roles";

/** Shown instead of a page the admin's role cannot open (the database refuses it anyway). */
export function AdminNoAccess({ role }: { role: AdminRole }) {
  return <section className="card" role="alert" style={{ maxWidth: 560 }}>
    <h1 style={{ marginTop: 0, fontSize: 22 }}>هذه الصفحة خارج صلاحيتك</h1>
    <p>دورك في فريق الإدارة «{adminRoleLabels[role]}». اطلب من مالك المنصة تغيير دورك إذا تحتاجها.</p>
    <Link className="btn" href="/admin">رجوع إلى نظرة عامة</Link>
  </section>;
}
