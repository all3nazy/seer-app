import { describe, expect, it } from "vitest";
import { checkTable, findSection, mapHeader, normaliseRow, parseDelimited } from "../lib/import";

const sections = ["الصف الأول — أ", "أ", "الصف الثاني — ب", "ب"];
describe("student import", () => {
  it("reads CSV with quotes and tab-separated rows pasted from Excel", () => {
    expect(parseDelimited('اسم الطالب,الجوال\n"سارة, محمد",0501\n')).toEqual([["اسم الطالب", "الجوال"], ["سارة, محمد", "0501"]]);
    expect(parseDelimited("الاسم\tالفصل\r\nريم\tأ\r\n")).toEqual([["الاسم", "الفصل"], ["ريم", "أ"]]);
  });
  it("maps Arabic and English headers, tolerating spelling", () => {
    expect(mapHeader(["إسم الطالب", "جوال ولي الامر", "Gender", "ملاحظة"])).toEqual(["full_name", "guardian_phone", "gender", null]);
  });
  it("normalises digits, dates, phones, gender and relationship", () => {
    expect(normaliseRow({ full_name: " ريم  خالد ", date_of_birth: "١٤/٠٥/٢٠١٩", guardian_phone: "٥٠١٢٣٤٥٦٧", gender: "أنثى", relationship: "الأم" }))
      .toMatchObject({ full_name: "ريم خالد", date_of_birth: "2019-05-14", guardian_phone: "0501234567", gender: "female", relationship: "mother" });
  });
  it("flags problems per row and finds sections by full or short name", () => {
    const { rows, missingName } = checkTable([["اسم الطالب", "الفصل", "جوال ولي الأمر", "اسم ولي الأمر"], ["ريم", "أ", "0501234567", "خالد"], ["", "ج", "12", ""]], sections);
    expect(missingName).toBe(false);
    expect(rows[0].errors).toEqual([]);
    expect(rows[1].errors.join(" ")).toMatch(/اسم الطالب.*الجوال|جوال/);
    expect(rows[1].errors.join(" ")).toContain("«ج»");
    expect(findSection("الصف الثاني — ب", sections.map((name, i) => ({ id: String(i), name })))?.id).toBe("2");
    expect(checkTable([["الجوال"], ["0500"]], sections).missingName).toBe(true);
  });
});
