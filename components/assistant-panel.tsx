"use client";
import { useRef, useState } from "react";
import { supportLink } from "../lib/support";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { assistantStatus } from "../lib/assistant-query";
import { classifyIntent, operationsLink, topicNames, type AssistantIntent, type AssistantTopic } from "../lib/assistant-intents";

type Reply={text:string;href?:string;linkLabel?:string};
type Thread={id:number;topic?:AssistantTopic;question:string;reply:Reply|null};
const quickTopics:AssistantTopic[]=["branches","children","guardians","enrollments","invoices","notifications"];
const help="أعرض أعداد الفروع والأطفال وأولياء الأمور، وحالات التسجيل والفواتير وفق صلاحياتك. جرّب: «كم طلبًا بانتظار الموافقة؟» أو «افتح الفروع». لا أغيّر السجلات؛ التعديل يتم في نموذج العمليات بعد التحقق والتأكيد.";

export function AssistantPanel({organizations,supportPhone}:{organizations:{id:string;name:string}[];supportPhone:string}) {
 const [org,setOrg]=useState(organizations[0]?.id??"");
 const [busy,setBusy]=useState(false);
 const locked=useRef(false);
 const [question,setQuestion]=useState("");
 const [threads,setThreads]=useState<Thread[]>([]);
 const [activeTopic,setActiveTopic]=useState<AssistantTopic>();
 const [newConversation,setNewConversation]=useState(false);
 const nextId=useRef(0);
 const supportUrl=supportLink(supportPhone);
 const replyTo=(id:number,reply:Reply)=>setThreads(items=>items.map(item=>item.id===id?{...item,reply}:item));

 async function run(questionText:string,intent:AssistantIntent) {
  if(locked.current) return;
  locked.current=true;
  setBusy(true);
  const id=++nextId.current;
  const topic="topic" in intent?intent.topic:undefined;
  setThreads(items=>[...items,{id,question:questionText,topic,reply:null}].slice(-30));
  if(topic) setActiveTopic(topic);
  try {
   if(intent.kind==="help") {replyTo(id,{text:help});return;}
   if(intent.kind==="support") {
    replyTo(id,supportUrl?{text:"يمكنك فتح رسالة دعم عامة عبر واتساب. لا تتضمن الرسالة أسماء المنشآت أو الأطفال أو أي سجلات.",href:supportUrl,linkLabel:"فتح قناة الدعم"}:{text:"قناة الدعم عبر واتساب قيد الإعداد. تواصل مع مسؤول المنصة؛ لم يُرسل طلب دعم."}); return;
   }
   if(intent.kind==="unknown") {replyTo(id,{text:"لم أفهم الطلب بما يكفي. اختر خدمة أو اكتب مثلًا «عدد الفروع» أو «افتح التسجيل» أو «الدعم». لم أنفذ أي إجراء."});return;}
   if(!org) {replyTo(id,{text:"لا توجد منشأة مرتبطة بحسابك. تواصل مع مسؤول المنصة لإسناد الصلاحيات."});return;}
   if(intent.kind==="mutation") {
    replyTo(id,{text:"لم أنفذ أي تغيير. استخدم صفحة العمليات لمراجعة القيم ثم تأكيد الحفظ. تتطلب الكتابة صلاحية مالك أو مدير وتُسجّل في سجل التدقيق.",href:operationsLink(org,intent.topic),linkLabel:"مراجعة العملية في الصفحة المخصصة"});return;
   }
   if(intent.kind==="navigate") {
    replyTo(id,{text:`يمكنك الانتقال إلى ${topicNames[intent.topic]} للمنشأة المحددة. تتحقق الصفحة من عضويتك وصلاحياتك.`,href:operationsLink(org,intent.topic),linkLabel:`فتح ${topicNames[intent.topic]}`});return;
   }
   const text=await assistantStatus(getSupabaseBrowserClient(),org,intent.topic);
   replyTo(id,{text,href:operationsLink(org,intent.topic==="notifications"?undefined:intent.topic),linkLabel:"فتح العمليات"});
  } catch(error) {replyTo(id,{text:error instanceof Error?error.message:"تعذر تنفيذ الاستعلام. حاول مجددًا."});}
  finally {locked.current=false;setBusy(false);}
 }
 function reset() {setThreads([]);setActiveTopic(undefined);setQuestion("");setNewConversation(true);}
 function ask(event:React.FormEvent) {
  event.preventDefault();const q=question.trim();if(!q || locked.current) return;
  setQuestion("");setNewConversation(false);void run(q,classifyIntent(q,activeTopic));
 }
 return <section className="card assistant" aria-label="مساعد سِير التشغيلي">
  <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><h2>مساعد سِير <span className="pill">تشغيلي</span></h2><button type="button" disabled={busy} onClick={reset}>محادثة جديدة</button></div>
  <p>مساعد عربي للاستعلام والتنقل. يعتمد على أوامر واضحة دون خدمة ذكاء اصطناعي مدفوعة.</p>
  <label htmlFor="seer-org">المنشأة</label>
  <select id="seer-org" value={org} onChange={event=>{setOrg(event.target.value);reset();}} disabled={busy} style={{width:"100%",padding:12,borderRadius:10,marginBottom:16}}>
   {!organizations.length?<option value="">لا توجد منشآت مرتبطة</option>:organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
  </select>
  <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}><button type="button" disabled={busy} onClick={()=>void run("ماذا أستطيع أن أفعل؟",{kind:"help"})}>الخدمات المتاحة</button>{quickTopics.map(topic=><button key={topic} type="button" disabled={busy} onClick={()=>void run(topicNames[topic],{kind:"status",topic})} style={{padding:"9px 12px",borderRadius:12,border:"1px solid #0f5e4c",background:"transparent",color:"inherit"}}>{topicNames[topic]}</button>)}</div>
  <p id="assistant-guidance">{activeTopic?`السياق الحالي: ${topicNames[activeTopic]}. يمكنك السؤال عن العدد أو الحالات.`:"اختر خدمة أو اكتب سؤالك."} تبقى المحادثة في هذه الصفحة فقط، وتُمسح عند تبديل المنشأة.</p>
  <div className="messages" role="log" aria-label="المحادثة" aria-live="polite" aria-busy={busy} style={{maxHeight:"65vh"}}>
   {!threads.length&&<p className="bubble">{newConversation?"بدأت محادثة جديدة. ":"أهلًا بك. "}{help}</p>}
   {threads.map(thread=><article key={thread.id} aria-label={`محادثة: ${thread.question}`} style={{display:"flex",flexDirection:"column",gap:8,borderBottom:"1px solid #e9e5de",paddingBottom:16}}>
    <p className="bubble user"><span className="pill">أنت</span> {thread.question}</p>
    <div className="bubble"><span className="pill">سِير</span><p>{thread.reply?.text??"جارٍ الاستعلام…"}</p>{thread.reply?.href&&<a href={thread.reply.href} {...(thread.reply.href.startsWith("https://wa.me/")?{target:"_blank",rel:"noopener noreferrer"}:{})} style={{textDecoration:"underline",display:"inline-block",padding:"8px 0"}}>{thread.reply.linkLabel}</a>}</div>
   </article>)}
  </div>
  <form onSubmit={ask} className="assistant-form" style={{marginTop:16}}><input aria-label="اسأل مساعد سِير" aria-describedby="assistant-guidance" placeholder="مثلاً: كم طلب تسجيل بانتظار الموافقة؟" maxLength={500} value={question} onChange={event=>setQuestion(event.target.value)} disabled={busy}/><button type="submit" disabled={busy||!question.trim()}>إرسال</button></form>
  <div style={{marginTop:20,borderTop:"1px solid #ddd",paddingTop:16}}><h3>تحتاج مساعدة إضافية؟</h3><p>تفتح رسالة مساعدة عامة دون أسماء المنشآت أو بيانات الأطفال. راجع الرسالة قبل إرسالها.</p>{supportUrl?<a href={supportUrl} target="_blank" rel="noopener noreferrer" style={{display:"inline-block",padding:"12px 16px",borderRadius:12,background:"#0f5e4c",color:"#fff"}}>التواصل مع الدعم عبر واتساب</a>:<p>قناة الدعم عبر واتساب قيد الإعداد.</p>}</div>
 </section>;
}
