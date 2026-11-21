import Link from "next/link";
import { requestPlatformAdmin } from "../lib/supabase/server";
import { serviceClient } from "../lib/supabase/service";
import { arNumber, formatDateTime, formatTime } from "../lib/dates";

type Summary = {
  locks: { scope: "account" | "ip"; subject: string; ip: string | null; failures: number; locked_until: string; created_at: string; active: boolean }[];
  top_ips: { ip: string; failures: number; accounts: number; last_at: string }[];
  failures_24h: number; successes_24h: number;
};

/**
 * «أمان الدخول» on the admin home: locks of the last 24 hours and the IPs failing most. Read on the
 * server with the service role (the data is closed to every other role), for platform admins only.
 */
export async function LoginSecurityCard() {
  if (!(await requestPlatformAdmin())) return null;
  const client = serviceClient();
  const result = client ? await client.rpc("login_security_summary") : null;
  const summary = (result && !result.error ? result.data : null) as Summary | null;
  return <section className="card" id="login-security" aria-labelledby="login-security-title" style={{ marginTop: 16 }}>
    <div className="adm-card-head"><h2 id="login-security-title">أمان الدخول</h2><Link href="/admin/security">الصفحة الكاملة والحظر</Link></div>
    {!summary ? <p className="hint">ما قدرت أقرأ سجل الدخول الآن (تأكد من تطبيق ترحيل حماية الدخول ومن مفتاح الخدمة).</p> : <>
      <p className="hint" style={{ marginTop: 0 }}>آخر ٢٤ ساعة: {arNumber(summary.successes_24h)} دخول ناجح، و{arNumber(summary.failures_24h)} محاولة فاشلة.</p>
      <h3 style={{ fontSize: 15, margin: "12px 0 8px" }}>الأقفال ({arNumber(summary.locks.length)})</h3>
      {summary.locks.length ? <ul className="records">{summary.locks.map((lock, index) => <li key={index}>
        <span><strong>{lock.scope === "account" ? "حساب" : "IP"}</strong> <span dir="ltr">{lock.subject}</span>
          <span className="hint" style={{ display: "block" }}>{arNumber(lock.failures)} محاولة · بدأ {formatDateTime(lock.created_at)}{lock.scope === "account" && lock.ip ? <> · من <span dir="ltr">{lock.ip}</span></> : null}</span></span>
        <span className={`chip-soft ${lock.active ? "rose" : ""}`}>{lock.active ? `مقفل حتى ${formatTime(lock.locked_until)}` : "انتهى"}</span>
      </li>)}</ul> : <p className="empty">ما فيه أقفال خلال آخر ٢٤ ساعة.</p>}
      <h3 style={{ fontSize: 15, margin: "12px 0 8px" }}>أكثر عناوين IP فشلًا</h3>
      {summary.top_ips.length ? <div className="table-wrap"><table className="links-table"><thead><tr><th>IP</th><th>محاولات فاشلة</th><th>حسابات مختلفة</th><th>آخر محاولة</th></tr></thead>
        <tbody>{summary.top_ips.map(row => <tr key={row.ip}><td dir="ltr">{row.ip}</td><td>{arNumber(row.failures)}</td><td>{arNumber(row.accounts)}</td><td>{formatDateTime(row.last_at)}</td></tr>)}</tbody></table></div>
        : <p className="empty">ما فيه محاولات فاشلة خلال آخر ٢٤ ساعة.</p>}
    </>}
  </section>;
}
