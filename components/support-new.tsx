"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { ticketPage } from "../lib/support";
import { notify } from "./feedback";
import { arNumber } from "../lib/dates";

const openError = (code?: string) => code === "54000" ? "عندك ٣ تذاكر مفتوحة، أو رسائل كثيرة خلال وقت قصير. أكمل في تذكرة مفتوحة أو انتظر قليلًا." : code === "42501" ? "ما تقدر تفتح تذكرة لهذه المنشأة." : code === "22023" ? "اكتب عنوانًا ووصفًا للمشكلة." : "تعذر فتح التذكرة. حاول مرة ثانية.";

/**
 * A new ticket for the Seer team: the organization, the page the person was on and their last
 * questions to the assistant go with it. Nothing else is attached; only what they type here.
 */
export function SupportNew({ organizations, page, questions = [], initialText = "", initialSubject, compact = false, onOpened }: {
  organizations: { id: string; name: string }[]; page?: string | null; questions?: string[]; initialText?: string; initialSubject?: string; compact?: boolean; onOpened?: (id: string) => void;
}) {
  const router = useRouter();
  const [org, setOrg] = useState(organizations[0]?.id ?? "");
  const [subject, setSubject] = useState((initialSubject ?? initialText).slice(0, 80));
  const [body, setBody] = useState(initialText);
  const [sending, setSending] = useState(false);
  const recent = questions.filter(Boolean).slice(-5);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (sending || !org) return;
    setSending(true);
    const { data, error } = await getSupabaseBrowserClient().rpc("open_support_thread", {
      org, subject: subject.trim() || body.trim().slice(0, 80), body: body.trim(), page: ticketPage(page), questions: recent,
    });
    setSending(false);
    if (error || !data) { notify(openError(error?.code), "error"); return; }
    notify("وصلت تذكرتك لفريق سِير. يوصلك إشعار مع كل رد.", "info", "done");
    if (onOpened) onOpened(String(data)); else router.push(`/dashboard/support/${data}`);
  }
  if (!organizations.length) return <p className="hint">حسابك غير مرتبط بمنشأة بعد. راسلنا على البريد الموجود في صفحة الدخول.</p>;
  return <form className={`support-new${compact ? " compact" : ""}`} onSubmit={submit}>
    {organizations.length > 1 ? <label>المنشأة<select value={org} onChange={event => setOrg(event.target.value)}>{organizations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
    <label>العنوان<input value={subject} onChange={event => setSubject(event.target.value)} maxLength={120} placeholder="مثال: الحضور ما ينحفظ" /></label>
    <label>وش المشكلة؟<textarea value={body} onChange={event => setBody(event.target.value)} maxLength={2000} required placeholder="اكتب وش صار، ووش كنت تبي تسوي." /></label>
    <p className="hint" style={{ margin: 0 }}>يوصل مع تذكرتك: اسم منشأتك{ticketPage(page) ? `، والصفحة اللي كنت فيها (${ticketPage(page)})` : ""}{recent.length ? `، وآخر ${arNumber(recent.length)} أسئلة سألتها المساعد` : ""}. ما نرفق أي بيانات طلاب غير اللي تكتبه هنا.</p>
    <button type="submit" className="btn btn-primary" disabled={sending || !body.trim()}>{sending ? "جارٍ الإرسال…" : "أرسل لفريق سِير"}</button>
  </form>;
}
