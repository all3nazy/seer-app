"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { createTask, deleteTask, moveTask, updateTask } from "../app/dashboard/tasks/actions";
import { dueLabel, isOverdue, neighbourStatus, riyadhToday, taskPriorityLabels, taskStatuses, taskStatusLabels, type Task, type TaskStatus } from "../lib/tasks";
import { Icon, SunPhase } from "./icons";
import { celebrate, notify } from "./feedback";
import { play } from "../lib/sound";
import { memberName, type Member } from "../lib/team";

type Props = { organizationId: string; manager: boolean; initialTasks: Task[]; members?: Member[]; me?: string };
const emptyCopy: Record<TaskStatus, string> = {
  todo: "ما فيه مهام جديدة.",
  doing: "انقل مهمة هنا لما تبدأ فيها.",
  review: "ما فيه شيء ينتظر المراجعة.",
  done: "أول إنجاز يظهر هنا.",
};

export function TaskBoard({ organizationId, manager, initialTasks, members = [], me }: Props) {
  const [mineOnly, setMineOnly] = useState(false);
  const nameOf = (id: string | null | undefined) => id ? memberName(members.find(member => member.user_id === id), id === me) : null;
  const assigneeSelect = (value?: string | null) => members.length ? <label>المسؤول<select name="assignee_id" defaultValue={value ?? ""}>
    <option value="">بدون مسؤول</option>
    {members.map(member => <option key={member.user_id} value={member.user_id}>{memberName(member, member.user_id === me)}</option>)}
  </select></label> : null;
  const [tasks, setTasks] = useState(initialTasks);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const composer = useRef<HTMLFormElement>(null);
  const today = riyadhToday();
  const visibleTasks = useMemo(() => mineOnly && me ? tasks.filter(task => task.assignee_id === me) : tasks, [tasks, mineOnly, me]);
  const grouped = useMemo(() => Object.fromEntries(taskStatuses.map(status => [status, visibleTasks.filter(task => task.status === status)])) as Record<TaskStatus, Task[]>, [visibleTasks]);
  const overdue = visibleTasks.filter(task => isOverdue(task, today)).length;

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

  const [stage, setStage] = useState<TaskStatus>("todo");
  const n = (value: number) => value.toLocaleString("ar-SA");
  const total = visibleTasks.length;
  const tones: Record<TaskStatus, string> = { todo: "todo", doing: "doing", review: "review", done: "done" };
  return <div className="board-page" aria-busy={pending}>
    <div className="stats">
      <div className="stat sky"><span className="figure">{n(grouped.done.length)}<small>/{n(total)}</small></span><span className="label">منجزة</span><span className="progress leaf"><span style={{ width: `${total ? Math.round(grouped.done.length / total * 100) : 0}%` }} /></span></div>
      <div className={`stat ${overdue ? "peach" : "mint"}`}><span className="figure">{n(overdue)}</span><span className="label">{overdue ? "متأخرة عن موعدها" : "ما فيه شيء متأخر"}</span><span className="progress coral"><span style={{ width: `${total ? Math.round(overdue / total * 100) : 0}%` }} /></span></div>
    </div>

    {manager ? <form ref={composer} action={add} className="composer" aria-label="إضافة مهمة">
      <label>مهمة جديدة<input name="title" required maxLength={120} placeholder="جهّز تقويم الفصل الدراسي" /></label>
      <label>الأولوية<select name="priority" defaultValue="normal">{Object.entries(taskPriorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>التسليم<input type="date" name="due_date" /></label>
      {assigneeSelect()}
      <button type="submit" className="btn-primary" disabled={pending}><Icon name="plus" />إضافة</button>
    </form> : <p className="info-banner">تقدر تنقل المهام بين المراحل. الإضافة والتعديل للمالك أو المدير.</p>}

    {me && members.length > 1 ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label="عرض المهام">
      <button type="button" className={`chip-soft${!mineOnly ? " ok" : ""}`} aria-pressed={!mineOnly} onClick={() => setMineOnly(false)}>كل المهام</button>
      <button type="button" className={`chip-soft${mineOnly ? " ok" : ""}`} aria-pressed={mineOnly} onClick={() => setMineOnly(true)}>مهامي ({tasks.filter(task => task.assignee_id === me && task.status !== "done").length.toLocaleString("ar-SA")})</button>
    </div> : null}
    <nav className="segments stage-tabs" aria-label="المراحل">
      {taskStatuses.map(status => <button key={status} type="button" aria-pressed={stage === status} onClick={() => setStage(status)}>{taskStatusLabels[status]}<span className="count">{n(grouped[status].length)}</span></button>)}
    </nav>

    <div className="board" data-stage={stage} role="list" aria-label="لوحة المهام">
      {taskStatuses.map((status, index) => <section key={status} role="listitem" aria-labelledby={`col-${status}`} data-status={status}
        className={`column${over === status ? " drop" : ""}`}
        onDragOver={event => { if (dragging) { event.preventDefault(); setOver(status); } }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(null); }}
        onDrop={event => { event.preventDefault(); const task = tasks.find(item => item.id === dragging); setOver(null); setDragging(null); if (task) move(task, status); }}>
        <header className="column-head">
          <span className={`stage-${tones[status]}`}><SunPhase step={index as 0 | 1 | 2 | 3} /></span>
          <h2 id={`col-${status}`}>{taskStatusLabels[status]}</h2>
          <span className="count">{n(grouped[status].length)}</span>
        </header>
        {grouped[status].length ? grouped[status].map(task => {
          const late = isOverdue(task, today);
          const next = neighbourStatus(task.status, 1);
          const prev = neighbourStatus(task.status, -1);
          return <article key={task.id} draggable aria-label={task.title}
            className={["task", task.status === "done" ? "done" : "", dragging === task.id ? "dragging" : "", landed === task.id ? "landed" : ""].filter(Boolean).join(" ")}
            onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", task.id); setDragging(task.id); }}
            onDragEnd={() => { setDragging(null); setOver(null); }}>
            <div className="task-top">
              <span className={`tile-icon ${task.status === "done" ? "tone-leaf" : task.priority === "high" ? "tone-coral" : "tone-plum"}`} style={{ color: "#fff" }}><SunPhase step={index as 0 | 1 | 2 | 3} size={22} /></span>
              <div className="body"><h3>{task.title}</h3>{task.notes ? <p>{task.notes}</p> : null}</div>
            </div>
            <div className="task-meta">
              {task.status === "done" ? <span className="status ok">منجزة</span> : null}
              {task.priority === "high" && task.status !== "done" ? <span className="chip-soft coral">عاجلة</span> : null}
              {task.assignee_id ? <span className="chip-soft"><Icon name="users" />{nameOf(task.assignee_id)}</span> : null}
              {task.due_date ? <span className={`chip-soft ${late ? "rose" : ""}`}><Icon name="calendar" />{late ? "متأخرة، " : ""}{dueLabel(task.due_date, today)}</span> : null}
            </div>
            <div className="task-actions">
              <span className="side">
                {prev ? <button type="button" onClick={() => move(task, prev)} aria-label={`إرجاع «${task.title}» إلى ${taskStatusLabels[prev]}`} title={`إرجاع إلى ${taskStatusLabels[prev]}`}><Icon name="arrowPrev" /></button> : null}
                {manager ? <button type="button" onClick={() => openEditor(task)} aria-label={`تعديل «${task.title}»`} title="تعديل"><Icon name="edit" /></button> : null}
              </span>
              {next ? <button type="button" className="go" onClick={() => move(task, next)} aria-label={`نقل «${task.title}» إلى ${taskStatusLabels[next]}`}>{next === "done" ? <><Icon name="check" />إنجاز</> : <>{taskStatusLabels[next]}<Icon name="arrowNext" /></>}</button> : null}
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
        <div className="field-row">
          <label>المرحلة<select name="status" defaultValue={editing.status}>{taskStatuses.map(status => <option key={status} value={status}>{taskStatusLabels[status]}</option>)}</select></label>
          <label>الأولوية<select name="priority" defaultValue={editing.priority}>{Object.entries(taskPriorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>التسليم<input type="date" name="due_date" defaultValue={editing.due_date ?? ""} /></label>
        </div>
        {assigneeSelect(editing.assignee_id)}
        <div className="dialog-actions">
          <button type="button" className="btn btn-danger" onClick={remove} disabled={pending}>حذف</button>
          <div><button type="button" className="btn" onClick={() => dialog.current?.close()}>إلغاء</button><button type="submit" className="btn-primary" disabled={pending}>حفظ التعديلات</button></div>
        </div>
      </form> : null}
    </dialog>
  </div>;
}
