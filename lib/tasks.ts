import { ValidationError, uuid } from "./operations";
import { formatDay, riyadhDate } from "./dates";

export const taskStatuses = ["todo", "doing", "review", "done"] as const;
export type TaskStatus = (typeof taskStatuses)[number];
export const taskPriorities = ["low", "normal", "high"] as const;
export type TaskPriority = (typeof taskPriorities)[number];
export const taskStatusLabels: Record<TaskStatus, string> = { todo: "جديدة", doing: "قيد التنفيذ", review: "مراجعة", done: "منجزة" };
export const taskPriorityLabels: Record<TaskPriority, string> = { low: "منخفضة", normal: "عادية", high: "عاجلة" };
export type Task = {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  completed_at?: string | null;
  assignee_id?: string | null;
};
export type TaskValues = { title: string; notes: string | null; priority: TaskPriority; due_date: string | null; status?: TaskStatus; assignee_id?: string | null };

export function isTaskStatus(value: unknown): value is TaskStatus { return typeof value === "string" && taskStatuses.some(status => status === value); }
function isTaskPriority(value: unknown): value is TaskPriority { return typeof value === "string" && taskPriorities.some(priority => priority === value); }

export function taskStatus(value: unknown): TaskStatus {
  if (!isTaskStatus(value)) throw new ValidationError("حالة المهمة غير صالحة.");
  return value;
}
export function taskValues(data: FormData): TaskValues {
  const title = data.get("title");
  if (typeof title !== "string" || title.trim().length < 1 || title.trim().length > 120) throw new ValidationError("اكتب عنوان المهمة من حرف إلى ١٢٠ حرفًا.");
  const notes = data.get("notes");
  if (notes !== null && (typeof notes !== "string" || notes.length > 1000)) throw new ValidationError("الملاحظات لا تتجاوز ١٠٠٠ حرف.");
  const priority = data.get("priority") ?? "normal";
  if (!isTaskPriority(priority)) throw new ValidationError("الأولوية غير صالحة.");
  const due = data.get("due_date");
  let due_date: string | null = null;
  if (due) {
    if (typeof due !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(due)) || new Date(due).toISOString().slice(0, 10) !== due) throw new ValidationError("أدخل تاريخ تسليم صحيحًا.");
    due_date = due;
  }
  const status = data.get("status");
  // The assignee is only changed when the form includes the field; empty means unassigned.
  const assignee = data.has("assignee_id") ? data.get("assignee_id") : undefined;
  return {
    title: title.trim(), notes: typeof notes === "string" && notes.trim() ? notes.trim() : null, priority, due_date,
    ...(status ? { status: taskStatus(status) } : {}),
    ...(assignee !== undefined ? { assignee_id: assignee ? uuid(assignee) : null } : {}),
  };
}
export function taskId(value: unknown): string { return uuid(value); }

/** Today's date in Riyadh, so «متأخرة» matches what people see on their wall calendar. */
export function riyadhToday(now = new Date()): string {
  return riyadhDate(now);
}
export function isOverdue(task: Pick<Task, "status" | "due_date">, today = riyadhToday()): boolean {
  return task.status !== "done" && !!task.due_date && task.due_date < today;
}
export function dueLabel(due: string | null, today = riyadhToday()): string | null {
  if (!due) return null;
  if (due === today) return "اليوم";
  const days = Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000);
  if (days === 1) return "غدًا";
  if (days === -1) return "أمس";
  return formatDay(due);
}
export function neighbourStatus(status: TaskStatus, direction: 1 | -1): TaskStatus | null {
  return taskStatuses[taskStatuses.indexOf(status) + direction] ?? null;
}
