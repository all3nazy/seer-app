export const weekdays = [[0, "الأحد"], [1, "الإثنين"], [2, "الثلاثاء"], [3, "الأربعاء"], [4, "الخميس"]] as const;
export const assessmentKinds = ["quiz", "homework", "project", "participation", "midterm", "final"] as const;
export type AssessmentKind = (typeof assessmentKinds)[number];
export const assessmentLabels: Record<AssessmentKind, string> = { quiz: "اختبار قصير", homework: "واجب", project: "مشروع", participation: "مشاركة", midterm: "اختبار منتصف الفصل", final: "اختبار نهائي" };
export const behaviorCategories = ["participation", "respect", "homework", "punctuality", "cooperation", "conduct", "other"] as const;
export type BehaviorCategory = (typeof behaviorCategories)[number];
export const behaviorLabels: Record<BehaviorCategory, string> = { participation: "المشاركة", respect: "الاحترام", homework: "الواجبات", punctuality: "الانضباط بالوقت", cooperation: "التعاون", conduct: "السلوك", other: "أخرى" };

export type Assessment = { id: string; subject_id: string; title: string; kind: AssessmentKind; max_score: number; weight: number; due_date: string | null; term_id: string | null };
export type Grade = { assessment_id: string; child_id: string; score: number | null; absent: boolean };
export type SubjectResult = { subject_id: string; percent: number | null; graded_weight: number };

/** Weighted percentage per subject: Σ(score/max × weight) ÷ Σ(weight of graded items) × 100. Absences count as zero. */
export function subjectResults(assessments: Assessment[], grades: Grade[], childId: string): SubjectResult[] {
  const bySubject = new Map<string, { earned: number; weight: number }>();
  for (const assessment of assessments) {
    const grade = grades.find(row => row.assessment_id === assessment.id && row.child_id === childId);
    if (!grade || (grade.score === null && !grade.absent)) continue;
    const entry = bySubject.get(assessment.subject_id) ?? { earned: 0, weight: 0 };
    entry.earned += (Number(grade.score ?? 0) / Number(assessment.max_score)) * Number(assessment.weight);
    entry.weight += Number(assessment.weight);
    bySubject.set(assessment.subject_id, entry);
  }
  const subjects = [...new Set(assessments.map(assessment => assessment.subject_id))];
  return subjects.map(subject => {
    const entry = bySubject.get(subject);
    return { subject_id: subject, percent: entry && entry.weight ? Math.round((entry.earned / entry.weight) * 1000) / 10 : null, graded_weight: entry?.weight ?? 0 };
  });
}
export function overall(results: SubjectResult[]): number | null {
  const graded = results.filter(result => result.percent !== null);
  return graded.length ? Math.round((graded.reduce((sum, result) => sum + (result.percent ?? 0), 0) / graded.length) * 10) / 10 : null;
}
/** The grade wording used on Saudi report cards. */
export function gradeWord(percent: number | null): string {
  if (percent === null) return "—";
  return percent >= 90 ? "ممتاز" : percent >= 80 ? "جيد جدًا" : percent >= 70 ? "جيد" : percent >= 60 ? "مقبول" : "يحتاج دعم";
}
export function gradeTone(percent: number | null): string {
  return percent === null ? "" : percent >= 90 ? "ok" : percent >= 70 ? "sky" : percent >= 60 ? "coral" : "rose";
}
/** Grades of one assessment as CSV rows (for uploading to Noor or sharing with the subject lead). */
export function gradesCsvRows(students: { id: string; full_name: string; national_id: string | null }[], grades: Grade[], assessmentId: string, max: number): (string | number)[][] {
  return [["الطالب", "رقم الهوية", "الدرجة", `من ${max}`], ...students.map(student => {
    const grade = grades.find(row => row.assessment_id === assessmentId && row.child_id === student.id);
    return [student.full_name, student.national_id ?? "", grade?.absent ? "غائب" : grade?.score ?? "", max];
  })];
}
