"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTaskComment, createInquiry, deleteTaskComment, replyInquiry, setInquiryStatus, type WorkResult } from "../app/dashboard/my/actions";
import { moveTask } from "../app/dashboard/tasks/actions";
import { inquiryCategories, inquiryCategoryLabels } from "../lib/inquiries";
import { taskStatuses, taskStatusLabels, type TaskStatus } from "../lib/tasks";
import type { RecordOption } from "../lib/operations";
import { celebrate, notify } from "./feedback";

function useReset(state: WorkResult) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.success) { notify(state.success); form.current?.reset(); } else if (state.error) notify(state.error, "error"); }, [state]);
  return form;
}

export function TaskCommentForm({ organizationId, taskId }: { organizationId: string; taskId: string }) {
  const [state, action, pending] = useActionState(addTaskComment, {});
  const form = useReset(state);
  return <form ref={form} action={action} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
    <input type="hidden" name="organization_id" value={organizationId} /><input type="hidden" name="task_id" value={taskId} />
    <label style={{ flex: 1 }}><span className="sr-only">تعليق</span><textarea name="body" required maxLength={1000} placeholder="اكتب تحديثًا أو سؤالًا عن المهمة" style={{ minHeight: 48 }} /></label>
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "…" : "إرسال"}</button>
  </form>;
}
export function DeleteCommentButton({ organizationId, taskId, commentId }: { organizationId: string; taskId: string; commentId: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn-sm" disabled={pending} onClick={() => start(async () => { const result = await deleteTaskComment(organizationId, taskId, commentId); notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info"); })}>حذف</button>;
}

export function TaskStatusPicker({ organizationId, taskId, status }: { organizationId: string; taskId: string; status: TaskStatus }) {
  const [current, setCurrent] = useState(status);
  const [pending, start] = useTransition();
  const router = useRouter();
  return <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontWeight: 500 }}>الحالة
    <select value={current} disabled={pending} style={{ minHeight: 40, width: "auto" }} onChange={event => {
      const next = event.target.value as TaskStatus, previous = current;
      setCurrent(next);
      start(async () => {
        const result = await moveTask(organizationId, taskId, next);
        if (result.error) { setCurrent(previous); notify(result.error, "error"); return; }
        if (next === "done") celebrate(); else notify("تحدّثت المهمة.");
        router.refresh();
      });
    }}>{taskStatuses.map(item => <option key={item} value={item}>{taskStatusLabels[item]}</option>)}</select>
  </label>;
}

export function InquiryForm({ organizationId, tasks }: { organizationId: string; tasks: RecordOption[] }) {
  const [state, action, pending] = useActionState(createInquiry, {});
  const router = useRouter();
  const form = useReset(state);
  useEffect(() => { if (state.id) router.push(`/dashboard/inquiries/${state.id}?org=${encodeURIComponent(organizationId)}`); }, [state, organizationId, router]);
  return <form ref={form} action={action} className="composer">
    <input type="hidden" name="organization_id" value={organizationId} />
    <label>النوع<select name="category" defaultValue="general">{inquiryCategories.map(item => <option key={item} value={item}>{inquiryCategoryLabels[item]}</option>)}</select></label>
    {tasks.length ? <label>مهمة مرتبطة (اختياري)<select name="task_id" defaultValue=""><option value="">بدون</option>{tasks.map(task => <option key={task.id} value={task.id}>{task.name}</option>)}</select></label> : null}
    <label style={{ gridColumn: "1/-1" }}>العنوان<input name="subject" required maxLength={120} /></label>
    <label style={{ gridColumn: "1/-1" }}>الرسالة<textarea name="body" required maxLength={2000} /></label>
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "جارٍ الإرسال…" : "إرسال للإدارة"}</button>
  </form>;
}
export function ReplyForm({ organizationId, inquiryId }: { organizationId: string; inquiryId: string }) {
  const [state, action, pending] = useActionState(replyInquiry, {});
  const form = useReset(state);
  return <form ref={form} action={action} style={{ display: "grid", gap: 8 }}>
    <input type="hidden" name="organization_id" value={organizationId} /><input type="hidden" name="inquiry_id" value={inquiryId} />
    <label>ردّك<textarea name="body" required maxLength={2000} /></label>
    <button type="submit" className="btn-primary" disabled={pending} style={{ justifySelf: "start" }}>{pending ? "جارٍ الإرسال…" : "إرسال الرد"}</button>
  </form>;
}
export function InquiryStatusButtons({ organizationId, inquiryId, status, manager }: { organizationId: string; inquiryId: string; status: string; manager: boolean }) {
  const [pending, start] = useTransition();
  const run = (next: string) => start(async () => { const result = await setInquiryStatus(organizationId, inquiryId, next); notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info"); });
  return <span style={{ display: "flex", gap: 8 }}>
    {status !== "closed" ? <button type="button" className="btn" disabled={pending} onClick={() => run("closed")}>إغلاق الاستفسار</button> : null}
    {manager && status === "closed" ? <button type="button" className="btn" disabled={pending} onClick={() => run("open")}>إعادة فتحه</button> : null}
  </span>;
}
export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true))}>{copied ? "نُسخ" : "نسخ الرابط"}</button>;
}
