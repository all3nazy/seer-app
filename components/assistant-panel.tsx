"use client";
import { useEffect, useRef, useState } from "react";
import { supportLink } from "../lib/support";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { assistantStatus } from "../lib/assistant-query";
import { classifyIntent, operationsLink, topicNames, type AssistantIntent, type AssistantTopic } from "../lib/assistant-intents";
import { play } from "../lib/sound";
import { parseCommand, type BotCommand } from "../lib/bot-commands";
import { findGuide, isHowTo, type GuideEntry } from "../lib/bot-knowledge";
import { botBriefing, botHealth, botRepair, botCompleteTask, botDecideLeave, botMyTasks, botPendingLeave, botPickupPeople, botRecordPickup, botUnread, botCreateTask, botFindSections, botFindStudents, botSetAttendance, botToday, type BotStudent } from "../app/dashboard/assistant/actions";
import { briefingItems, briefingText, withOrg, dayGreeting, detectMood, empathyLead, notUnderstood, smallTalk, stripCourtesy } from "../lib/bot-persona";
import { attendanceLabels, type AttendanceStatus } from "../lib/students";
import { botPersonas, tipOfDay, type Stage } from "../lib/stage";
import { Icon } from "./icons";

type Action = { href: string; label: string; external?: boolean };
/** A proposal waiting for the person's confirmation; nothing runs before they press it. */
type Confirm = { summary: string; run: () => Promise<{ error?: string; data?: string }> };
type Choice = { label: string; sub?: string | null; pick: () => Promise<Reply> | Reply };
type Reply = { text: string; actions?: Action[]; confirm?: Confirm; choices?: Choice[]; list?: { label: string; sub?: string | null; href?: string; tone?: "alert" | "warn" | "ok" }[] };
type Thread = { id: number; topic?: AssistantTopic; question: string; reply: Reply | null; outcome?: { text: string; ok: boolean } | "running" | "cancelled" };
type Suggestion = { label: string; intent?: AssistantIntent; text?: string };
const suggestions: Suggestion[] = [
  { label: "ملخص اليوم", text: "ملخص اليوم" },
  { label: "مين غايب اليوم؟", text: "مين غايب اليوم؟" },
  { label: "مين متأخر؟", text: "مين متأخر؟" },
  { label: "مهامي", text: "مهامي" },
  { label: "الفصول الآن", text: "الفصول الآن" },
  { label: "المتابعات", intent: { kind: "status", topic: "notifications" } },
  { label: "نصيحة اليوم", text: "نصيحة اليوم" },
];
const help = "أقدر أعطيك ملخص يومك وأولوياتك («ملخص اليوم»)، وأعرض مهامك وأقفلها («مهامي»)، وأسلّم الطالب لولي أمره بتأكيد («سلّم ريم»)، وأعرض طلبات الإجازة وأعتمدها للمدير («الإجازات»)، وإشعاراتك الجديدة («الإشعارات»)، وأسجّل الحضور («سجّل ريم متأخرة»)، وأبحث عن طالب («وين سارة»)، وأعرض مين غايب أو متأخر اليوم، وأنشئ مهمة («أنشئ مهمة: تجهيز القاعة بكرة»)، وأفتح الفصل المباشر، وأعطيك ملخص المهام والتسجيل والفواتير حسب صلاحيتك، وأشرح لك أي قسم في المنصة («كيف أضيف موظف؟»، «وين ألقى رابط التسجيل؟»)، وأحوّلك للدعم إذا احتجت. أي تغيير أعرضه عليك أول، وما ينفّذ إلا بعد ما تضغط «تأكيد»، وينحفظ باسمك في سجل المنصة.";
const time = (iso: string) => new Date(iso).toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour: "numeric", minute: "2-digit" });
const riyadhHour = () => Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Riyadh" }).format(new Date()));
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function AssistantPanel({ organizations, supportPhone, stage = "school" }: { organizations: { id: string; name: string }[]; supportPhone: string; stage?: Stage }) {
  const persona = botPersonas[stage];
  const [org, setOrg] = useState(organizations[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [question, setQuestion] = useState("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeTopic, setActiveTopic] = useState<AssistantTopic>();
  const nextId = useRef(0);
  const lastQuestion = useRef("");
  const log = useRef<HTMLDivElement>(null);
  const supportUrl = supportLink(supportPhone);
  const replyTo = (id: number, reply: Reply) => { setThreads(items => items.map(item => item.id === id ? { ...item, reply } : item)); play("message"); };
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }); }, [threads]);

  const studentHref = (id: string) => `/dashboard/children/${id}?org=${encodeURIComponent(org)}`;
  /** Resolves a name to one student: one match continues, several become choices, none explains. */
  async function withStudent(name: string, next: (student: BotStudent) => Reply | Promise<Reply>): Promise<Reply> {
    const found = await botFindStudents(org, name);
    if (found.error) return { text: found.error };
    const students = found.data ?? [];
    if (!students.length) return { text: `ما لقيت طالب باسم «${name}». تأكد من الاسم أو جرّب جزء منه.` };
    if (students.length === 1) return next(students[0]);
    return { text: `لقيت ${students.length.toLocaleString("ar-SA")} بهذا الاسم. أي واحد تقصد؟`, choices: students.map(student => ({ label: student.full_name, sub: student.section, pick: () => next(student) })) };
  }
  async function runCommand(command: BotCommand): Promise<Reply> {
    if (command.kind === "tip") return { text: `💡 ${tipOfDay(stage)}` };
    if (!org) return { text: "حسابك غير مرتبط بمنشأة. تواصل مع مسؤول المنصة لإسناد الصلاحيات." };
    const orgParam = encodeURIComponent(org);
    if (command.kind === "brief") {
      const result = await botBriefing(org);
      if (result.error || !result.data) return { text: result.error ?? "تعذر تجهيز الملخص الآن." };
      const items = briefingItems(result.data);
      return {
        text: briefingText(items, riyadhHour()),
        list: items.map(item => ({ label: item.text, sub: item.label, tone: item.tone, href: withOrg(item.href, org) })),
        actions: [{ href: `/dashboard?org=${orgParam}`, label: "لوحة التشغيل" }],
      };
    }
    if (command.kind === "attendance") return withStudent(command.name, student => ({
      text: `أسجّل ${student.full_name}${student.section ? ` (${student.section})` : ""}: «${attendanceLabels[command.status]}» لليوم؟`,
      confirm: { summary: `${student.full_name}: ${attendanceLabels[command.status]}`, run: () => botSetAttendance(org, student.id, command.status) },
      actions: [{ href: studentHref(student.id), label: "ملف الطالب" }],
    }));
    if (command.kind === "find") return withStudent(command.name, student => ({
      text: `${student.full_name}${student.section ? ` — ${student.section}` : " — بدون فصل"}.`,
      actions: [{ href: studentHref(student.id), label: "فتح الملف" }, { href: `/dashboard/pickup?org=${orgParam}`, label: "التسليم" }],
    }));
    if (command.kind === "pickup") return withStudent(command.name, async student => {
      const people = await botPickupPeople(org, student.id);
      if (people.error) return { text: people.error, actions: [{ href: `/dashboard/pickup?org=${orgParam}`, label: "صفحة التسليم" }] };
      const list = people.data ?? [];
      if (!list.length) return { text: `${student.full_name} ما له أولياء أمر أو مصرّح لهم مسجّلين. أضفهم من ملفه أولًا.`, actions: [{ href: studentHref(student.id), label: "ملف الطالب" }] };
      return {
        text: `مين بيستلم ${student.full_name}؟ تأكد من هويته قبل التسليم.`,
        choices: list.map(person => ({ label: person.name, sub: person.relation, pick: () => ({
          text: `أسلّم ${student.full_name} لـ${person.name} (${person.relation}) الآن؟`,
          confirm: { summary: `تسليم ${student.full_name}`, run: () => botRecordPickup(org, student.id, person.key) },
        }) })),
        actions: [{ href: `/dashboard/pickup?org=${orgParam}`, label: "صفحة التسليم" }],
      };
    });
    if (command.kind === "myTasks") {
      const result = await botMyTasks(org);
      if (result.error) return { text: result.error };
      const tasks = result.data ?? [];
      if (!tasks.length) return { text: "ما عندك مهام مفتوحة. يعطيك العافية 🌿", actions: [{ href: `/dashboard/my?org=${orgParam}`, label: "مهامي" }] };
      return {
        text: `عندك ${tasks.length.toLocaleString("ar-SA")} مهمة مفتوحة. اختر وحدة إذا خلصتها وأقفلها لك:`,
        choices: tasks.map(task => ({ label: task.title, sub: task.due_date ? `موعدها ${task.due_date}` : "بدون موعد", pick: () => ({
          text: `أقفل «${task.title}» كمنجزة؟`, confirm: { summary: task.title, run: () => botCompleteTask(org, task.id) },
        }) })),
        actions: [{ href: `/dashboard/my?org=${orgParam}`, label: "مهامي" }],
      };
    }
    if (command.kind === "leave") {
      const result = await botPendingLeave(org);
      if (result.error) return { text: result.error };
      const rows = result.data ?? [];
      if (!rows.length) return { text: "ما فيه طلبات إجازة معلّقة. 👍", actions: [{ href: `/dashboard/staff?org=${orgParam}`, label: "الموظفين" }] };
      return {
        text: `فيه ${rows.length.toLocaleString("ar-SA")} طلب إجازة ينتظر قرارك:`,
        choices: rows.map(row => ({ label: row.who, sub: `${row.starts_on}${row.ends_on !== row.starts_on ? ` ← ${row.ends_on}` : ""} · ${row.days.toLocaleString("ar-SA")} يوم`, pick: () => ({
          text: `وش قرارك في إجازة ${row.who}؟`,
          choices: [
            { label: "اعتماد", pick: () => ({ text: `أعتمد إجازة ${row.who}؟`, confirm: { summary: `اعتماد إجازة ${row.who}`, run: () => botDecideLeave(org, row.id, true) } }) },
            { label: "رفض", pick: () => ({ text: `أرفض إجازة ${row.who}؟`, confirm: { summary: `رفض إجازة ${row.who}`, run: () => botDecideLeave(org, row.id, false) } }) },
          ],
        }) })),
        actions: [{ href: `/dashboard/staff?org=${orgParam}`, label: "الموظفين" }],
      };
    }
    if (command.kind === "health") {
      const result = await botHealth(org);
      if (result.error) return { text: result.error };
      const issues = (result.data ?? []).filter(check => check.count > 0);
      if (!issues.length) return { text: "فحصت النظام: كل شيء سليم ✓ ما فيه رسائل عالقة ولا دفعات معلّقة ولا أخطاء جديدة.", actions: [{ href: `/dashboard/health?org=${orgParam}`, label: "صحة النظام" }] };
      const fixable = issues.filter(check => check.fixable);
      return {
        text: `فحصت النظام: ${issues.length.toLocaleString("ar-SA")} بند يحتاج انتباه.${fixable.length ? " أقدر أصلح الآمن منها الحين:" : ""}`,
        list: issues.map(check => ({ label: `${check.label}: ${check.count.toLocaleString("ar-SA")}`, sub: check.fixable ? "يُصلح تلقائيًا" : null, href: `${check.href}${check.href.includes("?") ? "&" : "?"}org=${orgParam}` })),
        choices: fixable.map(check => ({ label: `إصلاح: ${check.label}`, pick: () => ({ text: `أصلح «${check.label}»؟`, confirm: { summary: check.label, run: () => botRepair(org, check.id) } }) })),
        actions: [{ href: `/dashboard/health?org=${orgParam}`, label: "صحة النظام" }],
      };
    }
    if (command.kind === "unread") {
      const result = await botUnread(org);
      if (result.error) return { text: result.error };
      const rows = result.data ?? [];
      if (!rows.length) return { text: "ما فيه إشعارات جديدة. كل شيء مقروء ✓" };
      return { text: `عندك ${rows.length.toLocaleString("ar-SA")} إشعار جديد:`, list: rows.map(row => ({ label: row.title, sub: row.body, href: row.url ?? undefined })) };
    }
    if (command.kind === "task") {
      if (!command.title) return { text: "وش عنوان المهمة؟ اكتب مثلًا: «أنشئ مهمة: تجهيز القاعة بكرة»." };
      const when = command.due === "today" ? " وموعدها اليوم" : command.due === "tomorrow" ? " وموعدها بكرة" : "";
      return { text: `أنشئ مهمة «${command.title}»${when}؟`, confirm: { summary: `مهمة: ${command.title}`, run: () => botCreateTask(org, command.title, command.due) }, actions: [{ href: `/dashboard/tasks?org=${orgParam}`, label: "لوحة المهام" }] };
    }
    if (command.kind === "openClass") {
      const sections = await botFindSections(org, command.name);
      if (sections.error) return { text: sections.error };
      const rows = sections.data ?? [];
      if (!command.name || !rows.length) return { text: command.name ? `ما لقيت فصل باسم «${command.name}». هذي صفحة متابعة الفصول.` : "تفضل، متابعة الفصول مباشرة.", actions: [{ href: `/dashboard/classes?org=${orgParam}`, label: "متابعة الفصول" }] };
      return { text: rows.length === 1 ? `تفضل، ${rows[0].name} مباشر.` : "أي فصل؟", actions: rows.map(row => ({ href: `/dashboard/classes/${row.id}?org=${orgParam}`, label: row.name })) };
    }
    const result = await botToday(org, command.status);
    if (result.error || !result.data) return { text: result.error ?? "تعذر قراءة الحضور." };
    const { counts, names, total } = result.data;
    const n = (value: number) => value.toLocaleString("ar-SA");
    const line = `اليوم: ${n(counts.present)} حاضر، ${n(counts.late)} متأخر، ${n(counts.absent)} غائب، ${n(counts.excused)} بعذر، و${n(counts.pending)} ما تسجّل حضورهم من ${n(total)}.`;
    if (!command.status) return { text: line, actions: [{ href: `/dashboard/classes?org=${orgParam}`, label: "متابعة الفصول" }] };
    const label = command.status === "pending" ? "ما تسجّل حضورهم" : attendanceLabels[command.status as AttendanceStatus];
    const count = counts[command.status];
    if (!count) return { text: `ما فيه أحد «${label}» اليوم. ${line}` };
    return {
      text: `${label}: ${n(count)}${names.length < count ? ` (أعرض أول ${n(names.length)})` : ""}.`,
      list: names.map(row => ({ label: row.full_name, sub: [row.section, row.at ? time(row.at) : null].filter(Boolean).join(" · ") || null, href: row.id ? studentHref(row.id) : undefined })),
      actions: [{ href: `/dashboard/classes?org=${orgParam}`, label: "متابعة الفصول" }],
    };
  }
  async function confirmAction(id: number, confirm: Confirm) {
    setThreads(items => items.map(item => item.id === id ? { ...item, outcome: "running" } : item));
    play("tap");
    try {
      const result = await confirm.run();
      setThreads(items => items.map(item => item.id === id ? { ...item, outcome: result.error ? { text: result.error, ok: false } : { text: result.data ?? "تم.", ok: true } } : item));
      play(result.error ? "error" : "done");
    } catch {
      setThreads(items => items.map(item => item.id === id ? { ...item, outcome: { text: "تعذر التنفيذ. حاول مجددًا.", ok: false } } : item));
    }
  }
  async function choose(id: number, choice: Choice) {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    setThreads(items => items.map(item => item.id === id ? { ...item, reply: null, question: `${item.question} ← ${choice.label}` } : item));
    try { replyTo(id, await choice.pick()); }
    catch { replyTo(id, { text: "تعذر التنفيذ. حاول مجددًا." }); }
    finally { locked.current = false; setBusy(false); }
  }

  const supportReply = (lead: string): Reply => supportUrl
    ? { text: `${lead} تقدر تكلم الدعم عبر واتساب؛ الرسالة ما فيها أسماء منشآت ولا طلاب ولا أي سجلات.`, actions: [{ href: supportUrl, label: "واتساب الدعم", external: true }] }
    : { text: `${lead} تواصل مع مسؤول المنصة، وقناة الدعم عبر واتساب قيد الإعداد.` };
  function guideReply(entry: GuideEntry): Reply {
    const href = org ? `${entry.href}?org=${encodeURIComponent(org)}` : entry.href;
    const notes = [entry.computerOnly ? "يفتح على الكمبيوتر أو الآيباد." : null, entry.managers ? "متاح للمالك والمدير." : null].filter(Boolean).join(" ");
    return { text: `${entry.answer}${notes ? ` ${notes}` : ""}`, actions: [{ href, label: `فتح ${entry.title}` }] };
  }
  async function answer(intent: AssistantIntent): Promise<Reply> {
    if (intent.kind === "help") return { text: help };
    if (intent.kind === "unknown") return supportReply(notUnderstood(lastQuestion.current, persona));
    if (intent.kind === "support") return supportReply("أكيد، الدعم موجود لخدمتك.");
    if (!org) return { text: "حسابك غير مرتبط بمنشأة. تواصل مع مسؤول المنصة لإسناد الصلاحيات." };
    if (intent.kind === "mutation") return {
      text: intent.topic === "tasks" ? "لإنشاء مهمة قل لي «أنشئ مهمة: عنوانها» وأعرضها عليك للتأكيد، أو افتحها من لوحة المهام." : "هذا التعديل يصير من صفحته عشان تراجع القيم قبل الحفظ. الكتابة تحتاج صلاحية مالك أو مدير وتنحفظ في سجل التدقيق.",
      actions: [{ href: operationsLink(org, intent.topic), label: intent.topic ? `فتح ${topicNames[intent.topic]}` : "فتح السجلات" }],
    };
    if (intent.kind === "navigate") return { text: `تفضل، هذي صفحة ${topicNames[intent.topic]}.`, actions: [{ href: operationsLink(org, intent.topic), label: `فتح ${topicNames[intent.topic]}` }] };
    const text = await assistantStatus(getSupabaseBrowserClient(), org, intent.topic);
    const actions: Action[] = intent.topic === "notifications"
      ? [{ href: operationsLink(org, "tasks"), label: "لوحة المهام" }, { href: operationsLink(org, "enrollments"), label: "التسجيل" }]
      : [{ href: operationsLink(org, intent.topic), label: `فتح ${topicNames[intent.topic]}` }];
    return { text, actions };
  }
  /** Commands first, then "how do I…" questions about the platform, then the older topic questions. */
  function route(raw: string): { resolve: () => Promise<Reply> | Reply; topic?: AssistantTopic } {
    lastQuestion.current = raw;
    const social = smallTalk(raw, persona, riyadhHour());
    if (social) return { resolve: () => ({ text: social }) };
    // «السلام عليكم، مين غايب؟» → the greeting is answered in the tone, the request still runs.
    const text = stripCourtesy(raw) || raw;
    const command = parseCommand(text);
    if (command) return { resolve: () => runCommand(command) };
    const entry = findGuide(text);
    if (entry && isHowTo(text)) return { resolve: () => guideReply(entry) };
    const intent = classifyIntent(text, activeTopic);
    if (intent.kind === "unknown" && entry) return { resolve: () => guideReply(entry) };
    return { resolve: () => answer(intent), topic: "topic" in intent ? intent.topic : undefined };
  }
  async function run(questionText: string, routed: { resolve: () => Promise<Reply> | Reply; topic?: AssistantTopic }) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    play("tap");
    const id = ++nextId.current;
    const topic = routed.topic;
    setThreads(items => [...items, { id, question: questionText, topic, reply: null }].slice(-30));
    if (topic) setActiveTopic(topic);
    try {
      const [reply] = await Promise.all([routed.resolve(), wait(140)]);
      // Acknowledge frustration or urgency before the answer, without changing what it says.
      const lead = empathyLead(detectMood(questionText));
      replyTo(id, lead && !reply.text.startsWith("آسف") ? { ...reply, text: `${lead} ${reply.text}` } : reply);
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
    void run(q, route(q));
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
      {!threads.length ? <div className="answer"><p>{dayGreeting(riyadhHour())}! {persona.greeting}</p><p>{help}</p></div> : null}
      {threads.map(thread => <article key={thread.id} className="exchange" aria-label={`سؤال: ${thread.question}`}>
        <p className="question">{thread.question}</p>
        <div className="answer">
          {thread.reply ? <><p>{thread.reply.text}</p>
            {thread.reply.list?.length ? <ul className="bot-list">{thread.reply.list.map((item, index) => <li key={index} className={item.tone ? `brief-${item.tone}` : undefined}>{item.href ? <a href={item.href}>{item.label}</a> : item.label}{item.sub ? <span>{item.sub}</span> : null}</li>)}</ul> : null}
            {thread.reply.choices?.length ? <div className="bot-choices">{thread.reply.choices.map(choice => <button key={choice.label + (choice.sub ?? "")} type="button" disabled={busy} onClick={() => void choose(thread.id, choice)}><strong>{choice.label}</strong>{choice.sub ? <span>{choice.sub}</span> : null}</button>)}</div> : null}
            {thread.reply.confirm ? <div className={`bot-confirm${thread.outcome && thread.outcome !== "running" && thread.outcome !== "cancelled" ? (thread.outcome.ok ? " ok" : " bad") : ""}`}>
              {!thread.outcome ? <>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void confirmAction(thread.id, thread.reply!.confirm!)}>تأكيد</button>
                <button type="button" className="btn btn-sm" onClick={() => setThreads(items => items.map(item => item.id === thread.id ? { ...item, outcome: "cancelled" } : item))}>إلغاء</button>
              </> : thread.outcome === "running" ? <span className="typing" aria-label="جارٍ التنفيذ"><i /><i /><i /></span>
                : thread.outcome === "cancelled" ? <span className="hint">ألغيت، ما تغيّر شيء.</span>
                : <span role="status">{thread.outcome.ok ? "✓ " : ""}{thread.outcome.text}</span>}
            </div> : null}
            {thread.reply.actions?.length ? <div className="actions">{thread.reply.actions.map(action => <a key={action.href + action.label} href={action.href} {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{action.label}</a>)}</div> : null}
          </> : <span className="typing" aria-label="جارٍ التفكير"><i /><i /><i /></span>}
        </div>
      </article>)}
    </div>
    <div className="suggestions" aria-label="اقتراحات">
      {suggestions.map(item => <button key={item.label} type="button" className="suggestion" disabled={busy} onClick={() => void run(item.label, item.intent ? { resolve: () => answer(item.intent!), topic: "topic" in item.intent ? item.intent.topic : undefined } : route(item.text ?? item.label))}>{item.label}</button>)}
    </div>
    <form onSubmit={ask} className="assistant-form">
      <input aria-label="اسأل مساعد سِير" placeholder={`اكتب لـ${persona.name}: «سجّل ريم متأخرة»`} maxLength={500} value={question} onChange={event => setQuestion(event.target.value)} disabled={busy} />
      <button type="submit" disabled={busy || !question.trim()} aria-label="إرسال"><Icon name="chat" /></button>
    </form>
    <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>المحادثة تبقى في هذه الصفحة فقط وتنمسح عند إعادة التحميل. {supportUrl ? <a href={supportUrl} target="_blank" rel="noopener noreferrer">تحتاج دعم؟</a> : null}</p>
  </section>;
}
