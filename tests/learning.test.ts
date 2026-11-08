import { describe, expect, it } from "vitest";
import { gradeWord, gradesCsvRows, overall, subjectResults, type Assessment, type Grade } from "../lib/learning";

const a = (id: string, subject: string, max: number, weight: number): Assessment => ({ id, subject_id: subject, title: id, kind: "quiz", max_score: max, weight, due_date: null, term_id: null });
describe("report card maths", () => {
  const assessments = [a("q1", "math", 20, 10), a("final", "math", 100, 40), a("r1", "arabic", 10, 20), a("r2", "arabic", 10, 20), a("x", "science", 10, 10)];
  const grades: Grade[] = [
    { assessment_id: "q1", child_id: "c", score: 18, absent: false },
    { assessment_id: "final", child_id: "c", score: 80, absent: false },
    { assessment_id: "r1", child_id: "c", score: 10, absent: false },
    { assessment_id: "r2", child_id: "c", score: null, absent: true },
    { assessment_id: "q1", child_id: "other", score: 1, absent: false },
  ];
  it("weights each subject and counts absences as zero; ungraded subjects stay empty", () => {
    expect(subjectResults(assessments, grades, "c")).toEqual([
      { subject_id: "math", percent: 82, graded_weight: 50 },
      { subject_id: "arabic", percent: 50, graded_weight: 40 },
      { subject_id: "science", percent: null, graded_weight: 0 },
    ]);
    expect(overall(subjectResults(assessments, grades, "c"))).toBe(66);
  });
  it("words the grade", () => {
    expect([95, 85, 75, 65, 40, null].map(gradeWord)).toEqual(["ممتاز", "جيد جدًا", "جيد", "مقبول", "يحتاج دعم", "—"]);
  });
  it("exports one assessment's grades", () => {
    expect(gradesCsvRows([{ id: "c", full_name: "ريم", national_id: null }], grades, "r2", 10)[1]).toEqual(["ريم", "", "غائب", 10]);
  });
});
