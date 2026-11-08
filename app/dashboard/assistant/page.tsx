import { redirect } from "next/navigation";
import { createSupabaseServerClient, sessionUser } from "../../../lib/supabase/server";
import { AssistantPanel } from "../../../components/assistant-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "المساعد" };

export default async function AssistantPage() {
  const supabase = await createSupabaseServerClient();
  const user = await sessionUser(supabase);
  if (!user) redirect("/login");
  const { data: memberships, error: membershipError } = await supabase.from("memberships").select("organization_id,organizations(name)").eq("user_id", user.id);
  if (membershipError) return <><h1>تعذر تحميل المنشآت</h1><p role="alert">حاول مجددًا بعد قليل.</p></>;
  const organizations = (memberships ?? []).map(m => ({ id: m.organization_id, name: (m.organizations as unknown as { name: string } | null)?.name ?? "منشأة" }));
  return <>
    <header className="page-head"><div><h1>المساعد</h1><p>اسأل عن مهامك وسجلات منشأتك بالعربي.</p></div></header>
    <div style={{ maxWidth: 820 }}><AssistantPanel organizations={organizations} supportPhone={process.env.SEER_SUPPORT_WHATSAPP ?? ""} /></div>
  </>;
}
