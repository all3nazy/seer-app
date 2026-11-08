import { createSupabaseServerClient, sessionUser } from "../../../lib/supabase/server";
import { Logo } from "../../../components/icons";
import { JoinForm } from "../../../components/join-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "الانضمام للفريق", robots: { index: false, follow: false } };

/** A staff member opens the join link from WhatsApp, picks a username and password, and is in. */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const valid = /^[A-HJ-NP-Za-hj-np-z2-9]{8}$/.test(code);
  const client = await createSupabaseServerClient();
  const [view, user] = valid ? await Promise.all([client.rpc("join_link_view", { link: code }), sessionUser(client)]) : [{ data: null }, null];
  const info = view.data as { organization: string; role: string; display_name: string | null; valid: boolean } | null;
  return <main className="shell">
    <header className="top"><Logo /></header>
    <section className="card login-card" aria-labelledby="join-title">
      {!info || !info.valid ? <>
        <h1 id="join-title">الرابط غير صالح</h1>
        <p>انتهت صلاحية رابط الانضمام أو استُخدم من قبل. اطلب من إدارتك رابطًا جديدًا.</p>
        <p><a href="/login">لديك حساب؟ تسجيل الدخول</a></p>
      </> : <>
        <h1 id="join-title">أهلًا بك في {info.organization}</h1>
        <p>{info.display_name ? `${info.display_name}، ` : ""}تمت دعوتك كـ{info.role === "admin" ? "مدير" : "موظف"}. اختر اسم مستخدم وكلمة مرور، وتدخل مباشرة.</p>
        <JoinForm code={code.toUpperCase()} signedIn={Boolean(user)} suggestedName={info.display_name ?? ""} />
      </>}
    </section>
  </main>;
}
