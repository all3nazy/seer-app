"use client";
import { useEffect, useRef, useState } from "react";
import { supportLink } from "../lib/support";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { assistantStatus } from "../lib/assistant-query";
import { classifyIntent, operationsLink, topicNames, type AssistantIntent, type AssistantTopic } from "../lib/assistant-intents";
import { play } from "../lib/sound";
import { Icon } from "./icons";

type Action = { href: string; label: string; external?: boolean };
type Reply = { text: string; actions?: Action[] };
type Thread = { id: number; topic?: AssistantTopic; question: string; reply: Reply | null };
const suggestions: { label: string; intent: AssistantIntent }[] = [
  { label: "وش عندي اليوم؟", intent: { kind: "status", topic: "tasks" } },
  { label: "المتابعات", intent: { kind: "status", topic: "notifications" } },
  { label: "طلبات التسجيل", intent: { kind: "status", topic: "enrollments" } },
  { label: "الفواتير", intent: { kind: "status", topic: "invoices" } },
  { label: "الأطفال", intent: { kind: "status", topic: "children" } },
  { label: "افتح المهام", intent: { kind: "navigate", topic: "tasks" } },
];
const help = "أقدر أعطيك ملخص مهامك وش المتأخر منها، وأعداد الأطفال وأولياء الأمور والفروع، وحالات التسجيل والفواتير حسب صلاحيتك، وأوديك للصفحة المناسبة. جرّب: «كم مهمة متأخرة؟» أو «افتح التسجيل». ما أغيّر أي بيانات بنفسي؛ التعديل يصير في صفحته بعد مراجعتك.";
function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Riyadh" }).format(new Date()));
  return hour < 12 ? "صباح الخير" : "مساء الخير";
}
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function AssistantPanel({ organizations, supportPhone }: { organizations: { id: string; name: string }[]; supportPhone: string }) {
  const [org, setOrg] = useState(organizations[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [question, setQuestion] = useState("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeTopic, setActiveTopic] = useState<AssistantTopic>();
  const nextId = useRef(0);
  const log = useRef<HTMLDivElement>(null);
  const supportUrl = supportLink(supportPhone);
  const replyTo = (id: number, reply: Reply) => { setThreads(items => items.map(item => item.id === id ? { ...item, reply } : item)); play("message"); };
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }); }, [threads]);

  async function answer(intent: AssistantIntent): Promise<Reply> {
    if (intent.kind === "help") return { text: help };
    if (intent.kind === "support") return supportUrl
      ? { text: "تقدر تفتح رسالة دعم عامة عبر واتساب. الرسالة ما فيها أسماء منشآت ولا أطفال ولا أي سجلات.", actions: [{ href: supportUrl, label: "فتح واتساب الدعم", external: true }] }
      : { text: "قناة الدعم عبر واتساب قيد الإعداد. تواصل مع مسؤول المنصة؛ ما أرسلت أي طلب." };
    if (intent.kind === "unknown") return { text: "ما فهمت الطلب تمامًا. جرّب «وش عندي اليوم؟» أو «عدد الفروع» أو «افتح التسجيل». ما نفذت أي إجراء." };
    if (!org) return { text: "حسابك غير مرتبط بمنشأة. تواصل مع مسؤول المنصة لإسناد الصلاحيات." };
    if (intent.kind === "mutation") return {
      text: intent.topic === "tasks" ? "إضافة المهام وتعديلها تصير من لوحة المهام عشان تراجعها قبل الحفظ. ما غيّرت شيء." : "ما نفذت أي تغيير. افتح الصفحة المخصصة، راجع القيم، ثم أكّد الحفظ. الكتابة تحتاج صلاحية مالك أو مدير وتنحفظ في سجل التدقيق.",
      actions: [{ href: operationsLink(org, intent.topic), label: intent.topic ? `فتح ${topicNames[intent.topic]}` : "فتح السجلات" }],
    };
    if (intent.kind === "navigate") return { text: `تفضل، هذي صفحة ${topicNames[intent.topic]}. الصفحة تتحقق من صلاحياتك.`, actions: [{ href: operationsLink(org, intent.topic), label: `فتح ${topicNames[intent.topic]}` }] };
    const text = await assistantStatus(getSupabaseBrowserClient(), org, intent.topic);
    const actions: Action[] = intent.topic === "notifications"
      ? [{ href: operationsLink(org, "tasks"), label: "لوحة المهام" }, { href: operationsLink(org, "enrollments"), label: "التسجيل" }]
      : [{ href: operationsLink(org, intent.topic), label: `فتح ${topicNames[intent.topic]}` }];
    return { text, actions };
  }
  async function run(questionText: string, intent: AssistantIntent) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    play("tap");
    const id = ++nextId.current;
    const topic = "topic" in intent ? intent.topic : undefined;
    setThreads(items => [...items, { id, question: questionText, topic, reply: null }].slice(-30));
    if (topic) setActiveTopic(topic);
    try {
      const [reply] = await Promise.all([answer(intent), wait(450)]);
      replyTo(id, reply);
    } catch (error) {
      replyTo(id, { text: error instanceof Error ? error.message : "تعذر تنفيذ الاستعلام. حاول مجددًا." });
    } finally { locked.current = false; setBusy(false); }
  }
  function reset() { setThreads([]); setActiveTopic(undefined); setQuestion(""); }
  function ask(event: React.FormEvent) {
    event.preventDefault();
    const q = question.trim();
    if (!q || locked.current) return;
    setQuestion("");
    void run(q, classifyIntent(q, activeTopic));
  }
  return <section className="assistant" aria-label="مساعد سِير">
    <div className="assistant-head">
      <h2><span className={`orb${busy ? " thinking" : ""}`} aria-hidden="true" />مساعد سِير</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {organizations.length > 1 ? <label className="sr-only" htmlFor="seer-org">المنشأة</label> : null}
        {organizations.length > 1 ? <select id="seer-org" value={org} onChange={event => { setOrg(event.target.value); reset(); }} disabled={busy} style={{ width: "auto" }}>
          {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select> : null}
        <button type="button" className="btn btn-sm" disabled={busy || !threads.length} onClick={reset}>محادثة جديدة</button>
      </div>
    </div>
    <div className="messages" ref={log} role="log" aria-label="المحادثة" aria-live="polite" aria-busy={busy}>
      {!threads.length ? <div className="answer"><p>{greeting()}. {help}</p></div> : null}
      {threads.map(thread => <article key={thread.id} className="exchange" aria-label={`سؤال: ${thread.question}`}>
        <p className="question">{thread.question}</p>
        <div className="answer">
          {thread.reply ? <><p>{thread.reply.text}</p>
            {thread.reply.actions?.length ? <div className="actions">{thread.reply.actions.map(action => <a key={action.href + action.label} href={action.href} {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{action.label}</a>)}</div> : null}
          </> : <span className="typing" aria-label="جارٍ التفكير"><i /><i /><i /></span>}
        </div>
      </article>)}
    </div>
    <div className="suggestions" aria-label="اقتراحات"><span>جرّب:</span>
      {suggestions.map(item => <button key={item.label} type="button" className="suggestion" disabled={busy} onClick={() => void run(item.label, item.intent)}>{item.label}</button>)}
    </div>
    <form onSubmit={ask} className="assistant-form">
      <input aria-label="اسأل مساعد سِير" placeholder="مثلًا: كم مهمة متأخرة؟" maxLength={500} value={question} onChange={event => setQuestion(event.target.value)} disabled={busy} />
      <button type="submit" disabled={busy || !question.trim()} aria-label="إرسال"><Icon name="chat" /></button>
    </form>
    <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>المحادثة تبقى في هذه الصفحة فقط وتنمسح عند إعادة التحميل. {supportUrl ? <a href={supportUrl} target="_blank" rel="noopener noreferrer">تحتاج دعم؟</a> : null}</p>
  </section>;
}
