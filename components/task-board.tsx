"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { createTask, deleteTask, moveTask, updateTask } from "../app/dashboard/tasks/actions";
import { dueLabel, isOverdue, neighbourStatus, riyadhToday, taskPriorityLabels, taskStatuses, taskStatusLabels, type Task, type TaskStatus } from "../lib/tasks";
import { Icon, SunPhase } from "./icons";
import { celebrate, notify } from "./feedback";
import { play } from "../lib/sound";

type Props = { organizationId: string; manager: boolean; initialTasks: Task[] };
const emptyCopy: Record<TaskStatus, string> = {
  todo: "لا شيء جديد هنا.",
  doing: "اضغط دائرة أي مهمة لتبدأ العمل عليها.",
  review: "ما فيه شيء ينتظر المراجعة.",
  done: "أول إنجاز يظهر هنا.",
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

  const open = tasks.length - grouped.done.length;
  const n = (value: number) => value.toLocaleString("ar-SA");
  return <div className="board-page" aria-busy={pending}>
    <p className="brief-line">
      {open ? <>عندك <b>{n(open)}</b> {open === 1 ? "مهمة مفتوحة" : "مهام مفتوحة"}{overdue ? <>، منها <b className="hot">{n(overdue)}</b> متأخرة</> : null}. أنجزتم <b>{n(grouped.done.length)}</b>.</> : tasks.length ? <>كل المهام منجزة. يوم مرتب.</> : <>ما فيه مهام بعد. ابدأ بأول مهمة.</>}
    </p>

    {manager ? <form ref={composer} action={add} className="composer" aria-label="إضافة مهمة">
      <span className="composer-mark" aria-hidden="true"><SunPhase step={0} /></span>
      <label className="composer-title"><span className="sr-only">المهمة</span><input name="title" required maxLength={120} placeholder="اكتب مهمة جديدة واضغط إدخال" /></label>
      <label><span className="sr-only">الأولوية</span><select name="priority" defaultValue="normal">{Object.entries(taskPriorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span className="sr-only">تاريخ التسليم</span><input type="date" name="due_date" aria-label="تاريخ التسليم" /></label>
      <button type="submit" className="btn-primary" disabled={pending}><Icon name="plus" />إضافة</button>
    </form> : <p className="hint">تقدر تنقل المهام بين المراحل. الإضافة والتعديل للمدير.</p>}

    <div className="lanes" role="list" aria-label="مراحل العمل">
      {taskStatuses.map((status, index) => <section key={status} role="listitem" aria-labelledby={`lane-${status}`}
        className={`lane${over === status ? " drop" : ""}`}
        onDragOver={event => { if (dragging) { event.preventDefault(); setOver(status); } }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(null); }}
        onDrop={event => { event.preventDefault(); const task = tasks.find(item => item.id === dragging); setOver(null); setDragging(null); if (task) move(task, status); }}>
        <header className="lane-head">
          <SunPhase step={index as 0 | 1 | 2 | 3} size={28} />
          <h2 id={`lane-${status}`}>{taskStatusLabels[status]}</h2>
          <span className="lane-count">{n(grouped[status].length)}</span>
        </header>
        {grouped[status].length ? <ul className="rows">{grouped[status].map(task => {
          const late = isOverdue(task, today);
          const next = neighbourStatus(task.status, 1);
          const prev = neighbourStatus(task.status, -1);
          return <li key={task.id} draggable
            className={["row", task.status === "done" ? "done" : "", dragging === task.id ? "dragging" : "", landed === task.id ? "landed" : ""].filter(Boolean).join(" ")}
            onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", task.id); setDragging(task.id); }}
            onDragEnd={() => { setDragging(null); setOver(null); }}>
            <button type="button" className="advance" disabled={!next} onClick={() => next && move(task, next)}
              aria-label={next ? `نقل «${task.title}» إلى ${taskStatusLabels[next]}` : `«${task.title}» منجزة`} title={next ? `إلى ${taskStatusLabels[next]}` : "منجزة"}>
              <SunPhase step={index as 0 | 1 | 2 | 3} />
            </button>
            <div className="row-body">
              <span className="row-title">{task.priority === "high" ? <span className="urgent">عاجلة</span> : null}{task.title}</span>
              {task.notes ? <span className="row-notes">{task.notes}</span> : null}
            </div>
            {task.due_date ? <span className={`row-due${late ? " late" : ""}`}>{late ? "متأخرة، " : ""}{dueLabel(task.due_date, today)}</span> : <span className="row-due" />}
            <span className="row-tools">
              {prev ? <button type="button" onClick={() => move(task, prev)} aria-label={`إرجاع «${task.title}» إلى ${taskStatusLabels[prev]}`} title={`إرجاع إلى ${taskStatusLabels[prev]}`}><Icon name="arrowPrev" /></button> : null}
              {manager ? <button type="button" onClick={() => openEditor(task)} aria-label={`تعديل «${task.title}»`} title="تعديل"><Icon name="edit" /></button> : null}
            </span>
          </li>;
        })}</ul> : <p className="lane-empty">{emptyCopy[status]}</p>}
      </section>)}
    </div>

    <dialog ref={dialog} aria-labelledby="edit-title" onClose={() => setEditing(null)}>
      {editing ? <form key={editing.id} action={save} className="dialog-body">
        <h2 id="edit-title">تعديل المهمة</h2>
        <label>العنوان<input name="title" required maxLength={120} defaultValue={editing.title} /></label>
        <label>ملاحظات<textarea name="notes" rows={3} maxLength={1000} defaultValue={editing.notes ?? ""} /></label>
        <div className="field-row">
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
