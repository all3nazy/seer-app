/**
 * Importing students and guardians from a spreadsheet (Excel .xlsx, CSV, or rows pasted from
 * Excel). Parsing and checking happen here so the preview shows every problem before anything is
 * saved; the server checks again before writing.
 */
export const importColumns = [
  { key: "full_name", label: "اسم الطالب", required: true, aliases: ["اسم الطالب", "الاسم", "اسم الطفل", "الطالب", "student", "name"] },
  { key: "date_of_birth", label: "تاريخ الميلاد", aliases: ["تاريخ الميلاد", "الميلاد", "birth", "dob"] },
  { key: "gender", label: "الجنس", aliases: ["الجنس", "النوع", "gender"] },
  { key: "national_id", label: "هوية الطالب", aliases: ["هوية الطالب", "رقم الهوية", "السجل المدني", "الهوية", "id"] },
  { key: "section", label: "الفصل", aliases: ["الفصل", "الشعبة", "الصف والشعبة", "section", "class"] },
  { key: "guardian_name", label: "اسم ولي الأمر", aliases: ["اسم ولي الأمر", "ولي الأمر", "اسم الأب", "guardian"] },
  { key: "guardian_phone", label: "جوال ولي الأمر", aliases: ["جوال ولي الأمر", "الجوال", "رقم الجوال", "جوال", "phone", "mobile"] },
  { key: "relationship", label: "صلة القرابة", aliases: ["صلة القرابة", "القرابة", "relationship"] },
  { key: "guardian_national_id", label: "هوية ولي الأمر", aliases: ["هوية ولي الأمر", "guardian id"] },
] as const;
export type ImportKey = (typeof importColumns)[number]["key"];
export type ImportRow = Record<ImportKey, string>;
export type CheckedRow = { line: number; values: ImportRow; errors: string[] };

const norm = (value: string) => value.replace(/[ً-ٟـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").trim().toLowerCase();
const arabicDigits = (value: string) => value.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

/** Splits delimited text (CSV with quotes, or tab-separated rows pasted from Excel). */
export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const firstLine = clean.split("\n", 1)[0] ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (quoted) {
      if (char === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === delimiter) { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(cells => cells.some(value => value.trim()));
}

/** Maps the header row to known columns by name (Arabic or English, spelling-tolerant). */
export function mapHeader(header: string[]): (ImportKey | null)[] {
  return header.map(title => {
    const t = norm(title);
    const match = importColumns.find(column => column.aliases.some(alias => norm(alias) === t)) ?? importColumns.find(column => column.aliases.some(alias => t.includes(norm(alias)) && norm(alias).length > 3));
    return match ? match.key : null;
  });
}

const relationships: Record<string, string> = { "اب": "father", "الاب": "father", "والد": "father", "ام": "mother", "الام": "mother", "والده": "mother", "ولي امر": "guardian", "ولي الامر": "guardian", "father": "father", "mother": "mother" };
export function normaliseRow(raw: Partial<Record<ImportKey, string>>): ImportRow {
  const get = (key: ImportKey) => (raw[key] ?? "").toString().trim();
  const phone = arabicDigits(get("guardian_phone")).replace(/[\s()-]/g, "").replace(/^00/, "+");
  const date = arabicDigits(get("date_of_birth")).replace(/\//g, "-");
  const iso = /^\d{1,2}-\d{1,2}-\d{4}$/.test(date) ? date.split("-").reverse().map(part => part.padStart(2, "0")).join("-") : date;
  const gender = norm(get("gender"));
  return {
    full_name: get("full_name").replace(/\s+/g, " "),
    date_of_birth: iso,
    gender: /^(ذكر|ولد|m|male|بنين)$/.test(gender) ? "male" : /^(انثي|بنت|f|female|بنات)$/.test(gender) ? "female" : gender ? "?" : "",
    national_id: arabicDigits(get("national_id")).replace(/\s/g, ""),
    section: get("section"),
    guardian_name: get("guardian_name").replace(/\s+/g, " "),
    guardian_phone: /^5\d{8}$/.test(phone) ? `0${phone}` : phone,
    relationship: relationships[norm(get("relationship"))] ?? (get("relationship") ? "other" : "guardian"),
    guardian_national_id: arabicDigits(get("guardian_national_id")).replace(/\s/g, ""),
  };
}

export function checkRow(values: ImportRow, sectionNames: string[]): string[] {
  const errors: string[] = [];
  if (values.full_name.length < 2 || values.full_name.length > 120) errors.push("اسم الطالب مطلوب");
  if (values.date_of_birth && (!/^\d{4}-\d{2}-\d{2}$/.test(values.date_of_birth) || Number.isNaN(Date.parse(values.date_of_birth)))) errors.push("تاريخ الميلاد بصيغة 2019-05-14");
  if (values.gender === "?") errors.push("الجنس: ذكر أو أنثى");
  if (values.national_id && !/^[12]\d{9}$/.test(values.national_id)) errors.push("هوية الطالب ١٠ أرقام");
  if (values.guardian_national_id && !/^[12]\d{9}$/.test(values.guardian_national_id)) errors.push("هوية ولي الأمر ١٠ أرقام");
  if (values.guardian_phone && !/^\+?\d{8,15}$/.test(values.guardian_phone)) errors.push("جوال ولي الأمر غير صحيح");
  if ((values.guardian_phone || values.guardian_national_id) && !values.guardian_name) errors.push("اسم ولي الأمر مطلوب مع جواله");
  if (values.section && !sectionNames.some(name => norm(name) === norm(values.section) || norm(name).endsWith(norm(values.section)))) errors.push(`الفصل «${values.section}» غير موجود`);
  return errors;
}

/** Reads rows (header first) into checked rows ready for preview. */
export function checkTable(table: string[][], sectionNames: string[]): { rows: CheckedRow[]; missingName: boolean } {
  const [header = [], ...body] = table;
  const keys = mapHeader(header);
  const missingName = !keys.includes("full_name");
  const rows = body.slice(0, 1000).map((cells, index) => {
    const raw: Partial<Record<ImportKey, string>> = {};
    keys.forEach((key, column) => { if (key && cells[column] !== undefined) raw[key] = cells[column]; });
    const values = normaliseRow(raw);
    return { line: index + 2, values, errors: checkRow(values, sectionNames) };
  });
  return { rows, missingName };
}

/** Picks the section whose label matches a spreadsheet value ("الصف الأول — أ" or just "أ"). */
export function findSection<T extends { id: string; name: string }>(value: string, sections: T[]): T | undefined {
  if (!value) return undefined;
  const v = norm(value);
  return sections.find(section => norm(section.name) === v) ?? sections.find(section => norm(section.name).endsWith(v));
}

export const templateCsv = "﻿" + [importColumns.map(column => column.label).join(","), "ريم خالد السبيعي,2019-05-14,أنثى,1123456789,الصف الأول — أ,خالد السبيعي,0501234567,أب,1012345678"].join("\n");
