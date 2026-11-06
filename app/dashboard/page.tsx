import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import SignOutButton from "../../components/sign-out-button";
export const dynamic = "force-dynamic";

export default async function Dashboard(){
 if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  return <main className="shell"><h1>الإعداد غير مكتمل</h1><p>يجب ربط Supabase قبل تشغيل لوحة التحكم.</p></main>;
 const supabase=await createSupabaseServerClient();
 const {data:{user},error:authError}=await supabase.auth.getUser();
 if(authError||!user)redirect("/login");
 const {data:memberships,error:membershipError}=await supabase.from("memberships").select("organization_id,role,organizations(name,type)").eq("user_id",user.id);
 const orgs=await Promise.all((memberships??[]).map(async m=>{
  const orgId=m.organization_id;
  const [children,enrollments,pending,invoices,unpaid,branches]=await Promise.all([
   supabase.from("children").select("*",{count:"exact",head:true}).eq("organization_id",orgId),
   supabase.from("enrollments").select("*",{count:"exact",head:true}).eq("organization_id",orgId),
   supabase.from("enrollments").select("*",{count:"exact",head:true}).eq("organization_id",orgId).eq("status","pending"),
   supabase.from("invoices").select("*",{count:"exact",head:true}).eq("organization_id",orgId),
   supabase.from("invoices").select("*",{count:"exact",head:true}).eq("organization_id",orgId).eq("status","issued"),
   supabase.from("branches").select("*",{count:"exact",head:true}).eq("organization_id",orgId)
  ]);
  const metrics=[children,enrollments,pending,invoices,unpaid,branches];
  return {id:orgId,name:(m.organizations as unknown as {name:string}|null)?.name??"منشأة",role:m.role,failed:metrics.some(v=>v.error),values:metrics.map(v=>v.count??0)};
 }));
 return <main className="shell">
  <header className="top"><a className="logo" href="/">سِير.</a><div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}><a href="/dashboard/assistant">المساعد التشغيلي</a><SignOutButton/></div></header>
  <section className="hero"><h1>لوحة التشغيل</h1><p>ملخص المنشآت التي تملك صلاحية الاطلاع عليها.</p></section>
  {membershipError&&<p role="alert">تعذر تحميل عضويات المنشآت. حاول مرة أخرى.</p>}
  <div className="grid">{orgs.map(o=><section className="card" key={o.id}>
   <h2>{o.name}</h2><p>الصلاحية: {o.role}</p>
   {o.failed?<p role="alert">تعذر تحميل بعض المؤشرات.</p>:<dl style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12}}>
    {["الأطفال","طلبات التسجيل","طلبات بانتظار الموافقة","الفواتير","فواتير صادرة غير مسددة","الفروع"].map((label,i)=><div key={label}><dt style={{fontSize:13,color:"#697a74"}}>{label}</dt><dd style={{fontSize:24,fontWeight:700,margin:0}}>{o.values[i]}</dd></div>)}
   </dl>}
  </section>)}
  {!membershipError&&!orgs.length&&<section className="card"><h2>لا توجد منشآت مرتبطة</h2><p>يلزم إسناد حسابك إلى منشأة من مسؤول المنصة.</p></section>}
  </div>
 </main>;
}
