"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { createTask, deleteTask, moveTask, updateTask } from "../app/dashboard/tasks/actions";
import { dueLabel, isOverdue, neighbourStatus, riyadhToday, taskPriorityLabels, taskStatuses, taskStatusLabels, type Task, type TaskStatus } from "../lib/tasks";
import { Icon } from "./icons";
import { celebrate, notify } from "./feedback";
import { play } from "../lib/sound";

type Props = { organizationId: string; manager: boolean; initialTasks: Task[] };
const emptyCopy: Record<TaskStatus, string> = {
  todo: "لا مهام جديدة. أضف أول مهمة من الأعلى.",
  doing: "اسحب مهمة إلى هنا عندما يبدأ العمل عليها.",
  review: "المهام الجاهزة للتدقيق تظهر هنا.",
  done: "ما أُنجز يظهر هنا.",
};

export function TaskBoard({ organizationId, manager, initialTasks }: Props) {
  const [tasks, setTasks] = useState(initialTasks);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const composer = useRef<HTMLFormElement>(null);
  const today = riyadhToday();
  const grouped = useMemo(() => Object.fromEntries(taskStatuses.map(status => [status, tasks.filter(task => task.status === status)])) as Record<TaskStatus, Task[]>, [tasks]);
  const overdue = tasks.filter(task => isOverdue(task, today)).length;

  function move(task: Task, status: TaskStatus) {
    if (task.status === status) return;
    const previous = task.status;
    setTasks(items => items.map(item => item.id === task.id ? { ...item, status } : item));
    setLanded(task.id);
    window.setTimeout(() => setLanded(current => current === task.id ? null : current), 500);
    if (status === "done") celebrate(); else play("move");
    startTransition(async () => {
      const result = await moveTask(organizationId, task.id, status);
      if (result.error) {
        setTasks(items => items.map(item => item.id === task.id ? { ...item, status: previous } : item));
        notify(result.error, "error");
      } else if (result.task) {
        setTasks(items => items.map(item => item.id === task.id ? result.task! : item));
        if (status === "done") notify(`أحسنت، «${task.title}» منجزة`, "info", "message");
      }
    });
  }
  function add(data: FormData) {
    data.set("organization_id", organizationId);
    startTransition(async () => {
      const result = await createTask(data);
      if (result.error || !result.task) { notify(result.error ?? "تعذر إضافة المهمة.", "error"); return; }
      setTasks(items => [result.task!, ...items]);
      setLanded(result.task.id);
      composer.current?.reset();
      notify("أُضيفت المهمة", "info", "message");
    });
  }
  function openEditor(task: Task) { setEditing(task); requestAnimationFrame(() => dialog.current?.showModal()); }
  function save(data: FormData) {
    if (!editing) return;
    data.set("organization_id", organizationId);
    data.set("task_id", editing.id);
    const wasDone = editing.status === "done";
    startTransition(async () => {
      const result = await updateTask(data);
      if (result.error || !result.task) { notify(result.error ?? "تعذر الحفظ.", "error"); return; }
      setTasks(items => items.map(item => item.id === result.task!.id ? result.task! : item));
      dialog.current?.close();
      if (!wasDone && result.task.status === "done") celebrate();
      notify("حُفظت التعديلات");
    });
  }
  function remove() {
    if (!editing || !window.confirm(`حذف «${editing.title}» نهائيًا؟ لا يمكن التراجع.`)) return;
    const id = editing.id;
    startTransition(async () => {
      const result = await deleteTask(organizationId, id);
      if (result.error) { notify(result.error, "error"); return; }
      setTasks(items => items.filter(item => item.id !== id));
      dialog.current?.close();
      notify("حُذفت المهمة");
    });
  }

  return <div className="stack" aria-busy={pending}>
    <dl className="metrics" aria-label="ملخص المهام">
      <div className="metric"><dt>مفتوحة</dt><dd>{(tasks.length - grouped.done.length).toLocaleString("ar-SA")}</dd></div>
      <div className="metric"><dt>قيد التنفيذ</dt><dd>{grouped.doing.length.toLocaleString("ar-SA")}</dd></div>
      <div className={`metric${overdue ? " alert" : ""}`}><dt>متأخرة</dt><dd>{overdue.toLocaleString("ar-SA")}</dd></div>
      <div className="metric"><dt>منجزة</dt><dd>{grouped.done.length.toLocaleString("ar-SA")}</dd></div>
    </dl>

    {manager ? <form ref={composer} action={add} className="composer card" aria-label="إضافة مهمة">
      <label>المهمة<input name="title" required maxLength={120} placeholder="جهّز تقويم الفصل الدراسي" /></label>
      <label>الأولوية<select name="priority" defaultValue="normal">{Object.entries(taskPriorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>تاريخ التسليم<input type="date" name="due_date" /></label>
      <button type="submit" className="btn-primary" disabled={pending}><Icon name="plus" />إضافة</button>
    </form> : <p className="pill muted" style={{ width: "fit-content" }}>تقدر تنقل المهام بين المراحل. الإضافة والتعديل للمدير.</p>}

    <div className="board" role="list" aria-label="لوحة المهام">
      {taskStatuses.map(status => <section key={status} role="listitem" aria-labelledby={`col-${status}`}
        className={`column${over === status ? " drop" : ""}`}
        onDragOver={event => { if (dragging) { event.preventDefault(); setOver(status); } }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(null); }}
        onDrop={event => { event.preventDefault(); const task = tasks.find(item => item.id === dragging); setOver(null); setDragging(null); if (task) move(task, status); }}>
        <header className="column-head">
          <h2 id={`col-${status}`}><span className={`status-dot status-${status}`} aria-hidden="true" />{taskStatusLabels[status]}</h2>
          <span className="count" aria-label={`${grouped[status].length} مهمة`}>{grouped[status].length.toLocaleString("ar-SA")}</span>
        </header>
        {grouped[status].length ? grouped[status].map(task => {
          const late = isOverdue(task, today);
          const next = neighbourStatus(task.status, 1);
          const prev = neighbourStatus(task.status, -1);
          return <article key={task.id} draggable
            className={["task", task.status === "done" ? "done" : "", task.priority === "high" ? "prio-high" : "", dragging === task.id ? "dragging" : "", landed === task.id ? "landed" : ""].filter(Boolean).join(" ")}
            onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", task.id); setDragging(task.id); }}
            onDragEnd={() => { setDragging(null); setOver(null); }}
            aria-label={task.title}>
            <h3>{task.title}</h3>
            {task.notes ? <p>{task.notes}</p> : null}
            <div className="task-meta">
              {task.priority === "high" ? <span className="pill accent">عاجلة</span> : task.priority === "low" ? <span className="pill muted">منخفضة</span> : null}
              {task.due_date ? <span className={`pill ${late ? "danger" : task.status === "done" ? "ok" : "muted"}`}><Icon name="calendar" />{late ? "متأخرة، " : ""}{dueLabel(task.due_date, today)}</span> : null}
            </div>
            <div className="task-actions">
              {prev ? <button type="button" onClick={() => move(task, prev)} aria-label={`إرجاع «${task.title}» إلى ${taskStatusLabels[prev]}`} title={`إلى ${taskStatusLabels[prev]}`}><Icon name="arrowPrev" /></button> : null}
              {manager ? <button type="button" onClick={() => openEditor(task)} aria-label={`تعديل «${task.title}»`} title="تعديل"><Icon name="edit" /></button> : null}
              {next ? <button type="button" onClick={() => move(task, next)} aria-label={`نقل «${task.title}» إلى ${taskStatusLabels[next]}`} title={`إلى ${taskStatusLabels[next]}`}>{next === "done" ? <Icon name="check" /> : <Icon name="arrowNext" />}</button> : null}
            </div>
          </article>;
        }) : <p className="empty">{emptyCopy[status]}</p>}
      </section>)}
    </div>

    <dialog ref={dialog} aria-labelledby="edit-title" onClose={() => setEditing(null)}>
      {editing ? <form key={editing.id} action={save} className="dialog-body">
        <h2 id="edit-title">تعديل المهمة</h2>
        <label>العنوان<input name="title" required maxLength={120} defaultValue={editing.title} /></label>
        <label>ملاحظات<textarea name="notes" rows={3} maxLength={1000} defaultValue={editing.notes ?? ""} /></label>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
          <label>المرحلة<select name="status" defaultValue={editing.status}>{taskStatuses.map(status => <option key={status} value={status}>{taskStatusLabels[status]}</option>)}</select></label>
          <label>الأولوية<select name="priority" defaultValue={editing.priority}>{Object.entries(taskPriorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>التسليم<input type="date" name="due_date" defaultValue={editing.due_date ?? ""} /></label>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-danger" onClick={remove} disabled={pending}>حذف</button>
          <div><button type="button" className="btn" onClick={() => dialog.current?.close()}>إلغاء</button><button type="submit" className="btn-primary" disabled={pending}>حفظ التعديلات</button></div>
        </div>
      </form> : null}
    </dialog>
  </div>;
}
