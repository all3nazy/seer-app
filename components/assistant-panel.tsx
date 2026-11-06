"use client";
import { useState } from "react";
export function AssistantPanel(){
 const [message,setMessage]=useState("");
 const [messages,setMessages]=useState<{role:"user"|"assistant";text:string}[]>([{role:"assistant",text:"أهلًا، أنا مساعد سِير. أساعدك في فهم إجراءات المنصة. قريبًا ستتوفر الاستعلامات المباشرة حسب صلاحياتك."}]);
 function submit(e:React.FormEvent){e.preventDefault();const value=message.trim();if(!value)return;setMessages(m=>[...m,{role:"user",text:value},{role:"assistant",text:"المساعد في المرحلة التأسيسية، ولم يُربط بنموذج ذكاء اصطناعي أو بيانات المنشأة بعد. لن أنفذ أي إجراء أو أعرض معلومات غير متحقق منها."}]);setMessage("");}
 return <section className="card assistant" aria-label="مساعد سِير الذكي"><h2>مساعد سِير <span className="pill">تجريبي</span></h2><div className="messages" aria-live="polite">{messages.map((m,i)=><p key={i} className={m.role==="user"?"bubble user":"bubble"}>{m.text}</p>)}</div><form onSubmit={submit} className="assistant-form"><input aria-label="رسالتك" placeholder="اكتب سؤالك..." value={message} onChange={e=>setMessage(e.target.value)}/><button type="submit">إرسال</button></form></section>;
}
