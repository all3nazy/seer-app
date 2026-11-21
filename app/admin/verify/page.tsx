import { redirect } from "next/navigation";
import { requestSession } from "../../../lib/supabase/server";
import { AdminMfa } from "../../../components/admin-mfa";
import SignOutButton from "../../../components/sign-out-button";

export const metadata = { title: "التحقق الثنائي" };

/**
 * Two-step verification (Supabase MFA, TOTP) after the password: enrol a factor the first time,
 * then a six-digit code each time. Only platform-admin accounts get here; others are refused.
 */
export default async function AdminVerify() {
  const { client, user } = await requestSession();
  if (!user) redirect("/admin/login");
  const { data: claims } = await client.auth.getClaims();
  const { data: adminAccount } = await client.rpc("am_platform_admin_account");
  if (adminAccount !== true) {
    return <main className="adm-auth" id="main-content"><section className="card adm-auth-card" aria-labelledby="refused-title">
      <div className="adm-auth-brand"><span className="adm-logo">سِير<span className="adm-dot" aria-hidden="true" /></span><span className="adm-pill">أدمن</span></div>
      <h1 id="refused-title" style={{ margin: 0, fontSize: 22 }}>هذا الحساب ما له صلاحية هنا</h1>
      <p role="alert" style={{ margin: 0 }}>لوحة سِير أدمن لمالك المنصة فقط. اخرج وادخل بحساب المالك.</p>
      <span><SignOutButton to="/admin/login" /></span>
    </section></main>;
  }
  if (claims?.claims?.aal === "aal2") redirect("/admin");
  return <main className="adm-auth" id="main-content">
    <section className="card adm-auth-card" aria-labelledby="verify-title">
      <div className="adm-auth-brand"><span className="adm-logo">سِير<span className="adm-dot" aria-hidden="true" /></span><span className="adm-pill">أدمن</span></div>
      <AdminMfa />
      <span><SignOutButton to="/admin/login" /></span>
    </section>
  </main>;
}
