"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { addBehavior, createAssessment, deleteRecord, saveGrades, saveSubject, setSlot, type LearnResult } from "../app/dashboard/learning/actions";
import { assessmentKinds, assessmentLabels, behaviorCategories, behaviorLabels } from "../lib/learning";
import { notify } from "./feedback";

type Option = { id: string; name: string };
function useToast(state: LearnResult, after?: () => void) {
  useEffect(() => { if (state.success) { notify(state.success, "info", "done"); after?.(); } else if (state.error) notify(state.error, "error"); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function SubjectForm({ organizationId, grades }: { organizationId: string; grades: Option[] }) {
  const [state, action, pending] = useActionState(saveSubject, {});
  const [key, setKey] = useState(0);
  useToast(state, () => setKey(value => value + 1));
  return <form key={key} action={action} className="composer">
    <input type="hidden" name="organization_id" value={organizationId} />
    <label>المادة<input name="name" required maxLength={60} placeholder="الرياضيات" /></label>
    <label>الصف<select name="grade_level_id" defaultValue=""><option value="">كل الصفوف</option>{grades.map(grade => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label>
    <label>الحصص في الأسبوع<input name="weekly_periods" type="number" min={0} max={40} defaultValue={4} /></label>
    <button type="submit" className="btn-primary" disabled={pending}>إضافة</button>
  </form>;
}
export function DeleteLearning({ organizationId, table, id, label = "حذف" }: { organizationId: string; table: "subjects" | "assessments" | "behavior_notes"; id: string; label?: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={() => { if (window.confirm("متأكد من الحذف؟")) start(async () => { const result = await deleteRecord(organizationId, table, id); notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info"); }); }}>{label}</button>;
}

/** One timetable cell: pick the subject and teacher; empty subject clears it. */
export function TimetableCell({ organizationId, sectionId, weekday, period, subjectId, teacherId, subjects, teachers, editable, label }: {
  organizationId: string; sectionId: string; weekday: number; period: number; subjectId: string | null; teacherId: string | null; subjects: Option[]; teachers: Option[]; editable: boolean; label: { subject: string | null; teacher: string | null };
}) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ subject: subjectId ?? "", teacher: teacherId ?? "" });
  if (!editing) return <button type="button" className={`tt-cell${subjectId ? " filled" : ""}`} disabled={!editable} onClick={() => setEditing(true)}>
    {label.subject ? <><strong>{label.subject}</strong>{label.teacher ? <small>{label.teacher}</small> : null}</> : editable ? <span className="tt-empty">+</span> : null}
  </button>;
  const save = () => start(async () => {
    const result = await setSlot(organizationId, sectionId, weekday, period, draft.subject, draft.teacher);
    notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info");
    if (!result.error) setEditing(false);
  });
  return <div className="tt-edit">
    <select aria-label="المادة" value={draft.subject} onChange={event => setDraft(current => ({ ...current, subject: event.target.value }))}><option value="">— فارغة —</option>{subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    <select aria-label="المعلم" value={draft.teacher} onChange={event => setDraft(current => ({ ...current, teacher: event.target.value }))}><option value="">بدون معلم</option>{teachers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    <span><button type="button" className="btn btn-sm btn-primary" disabled={pending} onClick={save}>حفظ</button><button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>إلغاء</button></span>
  </div>;
}

export function AssessmentForm({ organizationId, sectionId, subjectId, terms }: { organizationId: string; sectionId: string; subjectId: string; terms: Option[] }) {
  const [state, action, pending] = useActionState(createAssessment, {});
  const [key, setKey] = useState(0);
  useToast(state, () => setKey(value => value + 1));
  return <form key={key} action={action} className="composer">
    <input type="hidden" name="organization_id" value={organizationId} /><input type="hidden" name="section_id" value={sectionId} /><input type="hidden" name="subject_id" value={subjectId} />
    <label>العنوان<input name="title" required maxLength={120} placeholder="اختبار الوحدة الأولى" /></label>
    <label>النوع<select name="kind" defaultValue="quiz">{assessmentKinds.map(kind => <option key={kind} value={kind}>{assessmentLabels[kind]}</option>)}</select></label>
    <label>الدرجة العظمى<input name="max_score" type="number" min={1} max={1000} step="0.5" defaultValue={10} /></label>
    <label>الوزن من ١٠٠<input name="weight" type="number" min={1} max={100} step="0.5" defaultValue={10} /></label>
    <label>التاريخ<input name="due_date" type="date" /></label>
    {terms.length ? <label>الفصل الدراسي<select name="term_id" defaultValue={terms[0]?.id}>{terms.map(term => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label> : null}
    <label style={{ gridColumn: "1/-1" }}>وصف (للواجبات)<input name="description" maxLength={1000} /></label>
    <button type="submit" className="btn-primary" disabled={pending}>إضافة تقييم</button>
  </form>;
}

/** A grade sheet: type a score per student, or «غ» for absent. Enter moves to the next row. */
export function GradeSheet({ organizationId, assessmentId, maxScore, students, grades }: { organizationId: string; assessmentId: string; maxScore: number; students: Option[]; grades: Record<string, { score: number | null; absent: boolean }> }) {
  const [state, action, pending] = useActionState(saveGrades, {});
  useToast(state);
  const initial = (id: string) => grades[id]?.absent ? "غ" : grades[id]?.score === null || grades[id]?.score === undefined ? "" : String(grades[id].score);
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(students.map(student => [student.id, initial(student.id)])));
  const numbers = Object.values(values).map(Number).filter(value => Number.isFinite(value) && value >= 0 && String(value) !== "");
  const filled = Object.values(values).filter(Boolean).length;
  const average = numbers.length ? Math.round((numbers.reduce((a, b) => a + b, 0) / numbers.length) * 10) / 10 : null;
  return <form action={action} className="grade-sheet">
    <input type="hidden" name="organization_id" value={organizationId} /><input type="hidden" name="assessment_id" value={assessmentId} /><input type="hidden" name="max_score" value={maxScore} />
    <p className="hint">اكتب الدرجة من {maxScore}، أو «غ» للغائب. مُدخل {filled.toLocaleString("ar-SA")} من {students.length.toLocaleString("ar-SA")}{average !== null ? ` · المتوسط ${average.toLocaleString("ar-SA")}` : ""}</p>
    <ol>{students.map((student, index) => { const value = values[student.id]; const bad = value && !/^(غ|a)$/i.test(value) && !(Number(value) >= 0 && Number(value) <= maxScore);
      return <li key={student.id}><span>{student.name}</span>
        <input name={`score:${student.id}`} inputMode="decimal" dir="ltr" aria-label={`درجة ${student.name}`} aria-invalid={bad ? true : undefined} value={value}
          onChange={event => setValues(current => ({ ...current, [student.id]: event.target.value }))}
          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); (document.querySelectorAll<HTMLInputElement>(".grade-sheet input[name^='score:']")[index + 1])?.focus(); } }} />
        {value && Number(value) >= 0 && Number(value) <= maxScore ? <span className="grade-bar" style={{ ["--p" as string]: `${(Number(value) / maxScore) * 100}%` }} /> : null}
      </li>; })}</ol>
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ الدرجات"}</button>
  </form>;
}

export function BehaviorForm({ organizationId, students }: { organizationId: string; students: Option[] }) {
  const [state, action, pending] = useActionState(addBehavior, {});
  const [kind, setKind] = useState<"positive" | "concern">("positive");
  useToast(state);
  return <form action={action} className="composer">
    <input type="hidden" name="organization_id" value={organizationId} /><input type="hidden" name="kind" value={kind} />
    <div className="chip-row" style={{ gridColumn: "1/-1" }}>
      <button type="button" className="pick" aria-pressed={kind === "positive"} onClick={() => setKind("positive")}>⭐ إيجابية</button>
      <button type="button" className="pick" aria-pressed={kind === "concern"} onClick={() => setKind("concern")}>⚠️ ملاحظة</button>
    </div>
    <label>الطالب<select name="child_id" required>{students.map(student => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label>
    <label>التصنيف<select name="category" defaultValue="participation">{behaviorCategories.map(category => <option key={category} value={category}>{behaviorLabels[category]}</option>)}</select></label>
    <label>النقاط<input name="points" type="number" min={1} max={5} defaultValue={1} /></label>
    <label style={{ gridColumn: "1/-1" }}>ملاحظة<input name="note" maxLength={500} /></label>
    <button type="submit" className="btn-primary" disabled={pending}>تسجيل</button>
  </form>;
}
