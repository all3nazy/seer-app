"use client";
import { useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase";

type Message = {role:"user"|"assistant";text:string};
type Topic = "help"|"branches"|"enrollments"|"invoices"|"children";
const topics: {id:Topic;label:string;description:string}[] = [
 {id:"help",label:"ماذا أستطيع أن أفعل؟",description:"عرض الخدمات المتاحة"},
 {id:"branches",label:"الفروع",description:"عدد الفروع المرتبطة"},
 {id:"enrollments",label:"طلبات التسجيل",description:"عدد الطلبات وحالاتها"},
 {id:"invoices",label:"الفواتير",description:"عدد الفواتير غير المدفوعة"},
 {id:"children",label:"ملفات الأطفال",description:"عدد الملفات المسجلة"}
];
const names:Record<Exclude<Topic,"help">,string>={branches:"الفروع",enrollments:"طلبات التسجيل",invoices:"الفواتير",children:"ملفات الأطفال"};
export function AssistantPanel({organizations}:{organizations:{id:string;name:string}[]}){
 const [org,setOrg]=useState(organizations[0]?.id??"");
 const [busy,setBusy]=useState(false);
 const [messages,setMessages]=useState<Message[]>([{role:"assistant",text:"أهلًا! أنا مساعد سِير التشغيلي. اختر المنشأة ثم الخدمة المطلوبة. أعرض فقط البيانات التي يسمح حسابك بالاطلاع عليها."}]);
 const say=(text:string)=>setMessages(m=>[...m,{role:"assistant",text}]);
 async function run(topic:Topic){
  const label=topics.find(t=>t.id===topic)?.label??"استعلام";
  setMessages(m=>[...m,{role:"user",text:label}]);
  if(topic==="help"){say("أقدر أعرض عدد الفروع وملفات الأطفال وطلبات التسجيل والفواتير من بيانات المنشأة. لا أنفذ تغييرات على السجلات.");return;}
  if(!org){say("لا توجد منشأة مرتبطة بحسابك. تواصل مع مسؤول المنصة لإضافتك إلى منشأة.");return;}
  setBusy(true);
  try{
   const client=getSupabaseBrowserClient();
   const {data:{user},error:authError}=await client.auth.getUser();
   if(authError||!user)throw new Error("انتهت الجلسة. سجل الدخول من جديد.");
   const {data:membership,error:memberError}=await client.from("memberships").select("organization_id").eq("organization_id",org).eq("user_id",user.id).maybeSingle();
   if(memberError||!membership)throw new Error("لا تملك صلاحية الاطلاع على هذه المنشأة.");
   const table=topic as Exclude<Topic,"help">;
   const {count,error}=await client.from(table).select("*",{count:"exact",head:true}).eq("organization_id",org);
   if(error)throw new Error("تعذر قراءة البيانات. تحقق من الصلاحيات وحاول مجددًا.");
   if(topic==="invoices"){
    const {count:unpaid,error:unpaidError}=await client.from("invoices").select("*",{count:"exact",head:true}).eq("organization_id",org).eq("status","issued");
    if(unpaidError)throw new Error("تعذر قراءة حالات الفواتير.");
    say("إجمالي الفواتير: "+(count??0)+"، الفواتير الصادرة غير المسددة: "+(unpaid??0)+".");
   }else if(topic==="enrollments"){
    const {count:pending,error:pendingError}=await client.from("enrollments").select("*",{count:"exact",head:true}).eq("organization_id",org).eq("status","pending");
    if(pendingError)throw new Error("تعذر قراءة حالات التسجيل.");
    say("إجمالي طلبات التسجيل: "+(count??0)+"، قيد الانتظار: "+(pending??0)+".");
   }else say("عدد "+names[topic]+": "+(count??0)+".");
  }catch(e){say(e instanceof Error?e.message:"تعذر تنفيذ الاستعلام.");}
  finally{setBusy(false);}
 }
 return <section className="card assistant" aria-label="مساعد سِير التشغيلي">
  <h2>مساعد سِير <span className="pill">تشغيلي</span></h2>
  <p>بدون ذكاء اصطناعي — استعلامات مباشرة وفق صلاحياتك.</p>
  <label htmlFor="seer-org">المنشأة</label>
  <select id="seer-org" value={org} onChange={e=>setOrg(e.target.value)} disabled={busy} style={{width:"100%",padding:12,borderRadius:10,marginBottom:16}}>
   {organizations.length===0?<option value="">لا توجد منشآت مرتبطة</option>:organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
  </select>
  <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>{topics.map(t=><button key={t.id} type="button" disabled={busy} onClick={()=>void run(t.id)} title={t.description} style={{padding:"9px 12px",borderRadius:12,border:"1px solid #0f5e4c",background:"transparent",color:"inherit",cursor:"pointer"}}>{t.label}</button>)}</div>
  <div className="messages" aria-live="polite" aria-busy={busy}>{messages.map((m,i)=><p key={i} className={m.role==="user"?"bubble user":"bubble"}>{m.text}</p>)}{busy&&<p className="bubble">جارٍ الاستعلام...</p>}</div>
 </section>;
}
