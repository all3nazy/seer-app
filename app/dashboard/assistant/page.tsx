import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { AssistantPanel } from "../../../components/assistant-panel";

export const dynamic = "force-dynamic";

export default async function AssistantPage(){
  if(!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY){
    return <main className="shell"><h1>إعداد Supabase مطلوب</h1></main>;
  }
  const supabase = await createSupabaseServerClient();
  const {data:{user},error:authError} = await supabase.auth.getUser();
  if(authError || !user) redirect("/login");
  const {data:memberships,error:membershipError} = await supabase.from("memberships")
    .select("organization_id,organizations(name)").eq("user_id",user.id);
  if(membershipError) return <main className="shell"><h1>تعذر تحميل المنشآت</h1><p role="alert">حاول مجددًا لاحقًا.</p><a href="/dashboard">العودة للوحة التشغيل</a></main>;
  const organizations = (memberships??[]).map(m=>({
    id:m.organization_id,
    name:(m.organizations as unknown as {name:string}|null)?.name??"منشأة"
  }));
  return <main className="shell">
    <nav className="top"><a href="/dashboard" className="logo">سِير.</a><span className="tag">المساعد التشغيلي</span></nav>
    <div style={{maxWidth:800,margin:"40px auto"}}>
      <AssistantPanel organizations={organizations} supportPhone={process.env.SEER_SUPPORT_WHATSAPP??""}/>
    </div>
  </main>;
}
