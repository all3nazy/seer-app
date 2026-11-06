import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { AssistantPanel } from "../../../components/assistant-panel";
export const dynamic="force-dynamic";
export default async function AssistantPage(){
 if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <main className="shell"><h1>إعداد Supabase مطلوب</h1></main>;
 const supabase=await createSupabaseServerClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
 return <main className="shell"><nav className="top"><a href="/dashboard" className="logo">سِير.</a><span className="tag">المساعد الذكي</span></nav><div style={{maxWidth:800,margin:"40px auto"}}><AssistantPanel/></div></main>;
}
