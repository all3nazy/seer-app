import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function Dashboard() {
  if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <main className="shell"><h1>الإعداد غير مكتمل</h1><p>يجب ربط Supabase قبل تشغيل لوحة التحكم.</p></main>;
  const supabase=await createSupabaseServerClient();
  const {data:{user},error}=await supabase.auth.getUser();
  if(error||!user)redirect("/login");
  const {data:memberships}=await supabase.from("memberships").select("organization_id,role,organizations(name,type)").eq("user_id",user.id);
  return <main className="shell"><header className="top"><a className="logo" href="/">سِير.</a><span className="tag">لوحة التحكم</span></header><section className="hero"><h1>مرحبًا بك في سِير</h1><p>المنشآت المصرح لك بإدارتها فقط</p></section><section className="grid">{memberships?.map((m,i)=><article className="card" key={m.organization_id+"-"+i}><h2>{(m.organizations as unknown as {name:string}|null)?.name??"منشأة"}</h2><p>الصلاحية: {m.role}</p></article>)}{!memberships?.length&&<article className="card"><h2>لا توجد منشآت مرتبطة</h2><p>يحتاج مسؤول المنصة إلى إسناد حسابك إلى منشأة.</p></article>}</section></main>;
}
