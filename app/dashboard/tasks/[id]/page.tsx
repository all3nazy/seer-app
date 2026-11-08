import Link from "next/link";
import { notFound } from "next/navigation";
import { loadOrgContext } from "../../../../lib/org-context";
import { OrgUnavailable } from "../../../../components/org-unavailable";
import { DeleteCommentButton, TaskCommentForm, TaskStatusPicker } from "../../../../components/work-forms";
import { dueLabel, isOverdue, riyadhToday, taskPriorityLabels, type Task } from "../../../../lib/tasks";
import { since, type TaskComment } from "../../../../lib/inquiries";
import { memberName, type Member } from "../../../../lib/team";
import { uuid } from "../../../../lib/operations";

export const dynamic = "force-dynamic";
export const metadata = { title: "مهمة" };

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ org?: string }> }) {
  const [{ id: rawId }, { org: requestedOrg }] = await Promise.all([params, searchParams]);
  let id: string;
  try { id = uuid(rawId); } catch { notFound(); }
  const context = await loadOrgContext(requestedOrg);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, userId, manager } = context;
  const [task, comments, members] = await Promise.all([
    client.from("tasks").select("id,title,notes,status,priority,due_date,completed_at,assignee_id").eq("organization_id", org).eq("id", id).maybeSingle(),
    client.from("task_comments").select("id,task_id,author_id,body,created_at").eq("organization_id", org).eq("task_id", id).order("created_at").limit(200),
    client.from("memberships").select("user_id,role,display_name").eq("organization_id", org),
  ]);
  if (task.error) return <section className="card"><h1>تعذر تحميل المهمة</h1><p role="alert">أعد تحميل الصفحة.</p></section>;
  if (!task.data) notFound();
  const row = task.data as Task;
  const memberRows = (members.data ?? []) as Member[];
  const name = (user: string | null) => memberName(memberRows.find(member => member.user_id === user), user === userId);
  const today = riyadhToday();
  const orgParam = encodeURIComponent(org);
  const dayAgo = Date.now() - 86400_000;
  return <div style={{ display: "grid", gap: 24, maxWidth: 760 }}>
    <header className="page-head" style={{ marginBottom: 0 }}>
      <div>
        <p className="hint"><Link href={`/dashboard/my?org=${orgParam}`}>مهامي</Link>{manager ? <> · <Link href={`/dashboard/tasks?org=${orgParam}`}>لوحة المهام</Link></> : null}</p>
        <h1>{row.title}</h1>
        <p>{[row.assignee_id ? `مسندة إلى ${name(row.assignee_id)}` : "غير مسندة", row.priority === "high" ? taskPriorityLabels.high : null, row.due_date ? `التسليم ${dueLabel(row.due_date, today)}` : null].filter(Boolean).join(" · ")}
          {isOverdue(row, today) ? <> <span className="chip-soft rose">متأخرة</span></> : null}</p>
      </div>
      <TaskStatusPicker organizationId={org} taskId={row.id} status={row.status} />
    </header>
    {row.notes ? <section className="card"><h2>التفاصيل</h2><p style={{ whiteSpace: "pre-wrap" }}>{row.notes}</p></section> : null}
    <section className="card" aria-labelledby="comments-title">
      <h2 id="comments-title">التعليقات والتحديثات</h2>
      {comments.error ? <p role="alert">تعذر تحميل التعليقات.</p> : (comments.data ?? []).length ? <ul className="records" style={{ marginBottom: 16 }}>
        {((comments.data ?? []) as TaskComment[]).map(comment => <li key={comment.id} style={{ display: "grid", gap: 4 }}>
          <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{name(comment.author_id)}</strong><span className="hint">{since(comment.created_at)}</span></span>
          <span style={{ whiteSpace: "pre-wrap" }}>{comment.body}</span>
          {manager || (comment.author_id === userId && Date.parse(comment.created_at) > dayAgo) ? <span><DeleteCommentButton organizationId={org} taskId={row.id} commentId={comment.id} /></span> : null}
        </li>)}
      </ul> : <p className="hint" style={{ marginBottom: 16 }}>ما فيه تعليقات بعد.</p>}
      <TaskCommentForm organizationId={org} taskId={row.id} />
    </section>
  </div>;
}
