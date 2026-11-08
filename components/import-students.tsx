"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { checkTable, importColumns, templateCsv, type CheckedRow } from "../lib/import";
import { readXlsx } from "../lib/xlsx";
import { parseDelimited } from "../lib/import";
import { importStudents, type ImportResult } from "../app/dashboard/children/import/actions";
import { notify } from "./feedback";

/** Upload or paste a sheet, review every row, then import the valid ones. */
export function ImportStudents({ organizationId, sectionNames }: { organizationId: string; sectionNames: string[] }) {
  const [rows, setRows] = useState<CheckedRow[] | null>(null);
  const [message, setMessage] = useState("");
  const [paste, setPaste] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();
  const load = (table: string[][]) => {
    const checked = checkTable(table, sectionNames);
    if (checked.missingName) { setRows(null); setMessage("ما لقيت عمود «اسم الطالب» في الصف الأول. استخدم النموذج أو سمِّ الأعمدة مثله."); return; }
    setMessage(""); setRows(checked.rows); setResult(null);
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5_000_000) { setMessage("الملف كبير. الحد ٥ ميجابايت."); return; }
    try {
      if (/\.xlsx$/i.test(file.name)) load(await readXlsx(await file.arrayBuffer()));
      else if (/\.(csv|txt|tsv)$/i.test(file.name)) load(parseDelimited(await file.text()));
      else setMessage("الصيغ المدعومة: Excel (.xlsx) أو CSV. ملفات .xls القديمة احفظها .xlsx أولًا.");
    } catch { setMessage("تعذر قراءة الملف. احفظه من Excel بصيغة .xlsx أو CSV وحاول مرة ثانية."); }
  };
  const valid = rows?.filter(row => !row.errors.length) ?? [];
  const download = () => {
    const url = URL.createObjectURL(new Blob([templateCsv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "نموذج-استيراد-الطلاب.csv"; a.click(); URL.revokeObjectURL(url);
  };
  return <div style={{ display: "grid", gap: 16 }}>
    <section className="card" style={{ display: "grid", gap: 12 }}>
      <h2 style={{ fontSize: 17, margin: 0 }}>١. جهّز الملف</h2>
      <p style={{ margin: 0 }}>صف أول فيه أسماء الأعمدة، وكل صف بعده طالب. الأعمدة المعروفة: {importColumns.map(column => column.label).join("، ")}. المطلوب منها «اسم الطالب» فقط.</p>
      <span><button type="button" className="btn" onClick={download}>تحميل النموذج</button></span>
    </section>
    <section className="card" style={{ display: "grid", gap: 12 }}>
      <h2 style={{ fontSize: 17, margin: 0 }}>٢. ارفع الملف أو الصق من Excel</h2>
      <label className="btn" style={{ justifySelf: "start", cursor: "pointer" }}>اختيار ملف Excel أو CSV<input type="file" accept=".xlsx,.csv,.txt,.tsv" hidden onChange={event => void onFile(event.target.files?.[0])} /></label>
      <label>أو الصق الصفوف المنسوخة من Excel (مع صف العناوين)<textarea rows={4} value={paste} onChange={event => setPaste(event.target.value)} dir="auto" /></label>
      <span><button type="button" className="btn btn-sm" disabled={!paste.trim()} onClick={() => load(parseDelimited(paste))}>قراءة الملصق</button></span>
      {message ? <p role="alert" className="form-error">{message}</p> : null}
    </section>
    {rows ? <section className="card" style={{ display: "grid", gap: 12 }}>
      <h2 style={{ fontSize: 17, margin: 0 }}>٣. راجع قبل الحفظ</h2>
      <p style={{ margin: 0 }}>{rows.length.toLocaleString("ar-SA")} صف: <strong>{valid.length.toLocaleString("ar-SA")} جاهز</strong>{rows.length - valid.length ? ` و${(rows.length - valid.length).toLocaleString("ar-SA")} فيه ملاحظات وما راح ينحفظ حتى تصلحه` : ""}.</p>
      <div className="table-wrap"><table className="links-table import-table"><thead><tr><th>#</th><th>الطالب</th><th>الفصل</th><th>ولي الأمر</th><th>الجوال</th><th>الحالة</th></tr></thead>
        <tbody>{rows.slice(0, 300).map(row => <tr key={row.line} className={row.errors.length ? "bad" : ""}>
          <td>{row.line}</td><td>{row.values.full_name}</td><td>{row.values.section || "—"}</td><td>{row.values.guardian_name || "—"}</td><td dir="ltr">{row.values.guardian_phone || "—"}</td>
          <td>{row.errors.length ? <span className="chip-soft rose">{row.errors.join("، ")}</span> : <span className="chip-soft ok">جاهز</span>}</td>
        </tr>)}</tbody></table></div>
      {rows.length > 300 ? <p className="hint">يعرض أول ٣٠٠ صف؛ الاستيراد يشمل الكل.</p> : null}
      <span><button type="button" className="btn btn-primary" disabled={pending || !valid.length} onClick={() => start(async () => {
        const outcome = await importStudents(organizationId, valid.map(row => ({ line: row.line, values: row.values })));
        setResult(outcome);
        notify(outcome.error ?? `أُضيف ${outcome.created?.toLocaleString("ar-SA")} طالب.`, outcome.error ? "error" : "info", outcome.error ? undefined : "done");
      })}>{pending ? "جارٍ الاستيراد…" : `استيراد ${valid.length.toLocaleString("ar-SA")} طالب`}</button></span>
    </section> : null}
    {result && !result.error ? <section className="card info-banner" role="status">
      <p style={{ margin: 0 }}>✓ أُضيف {result.created?.toLocaleString("ar-SA")} طالب و{result.guardians?.toLocaleString("ar-SA")} ولي أمر جديد، وانربط كل طالب بولي أمره.</p>
      {result.skipped?.length ? <ul>{result.skipped.map(item => <li key={item.line}>صف {item.line}: {item.reason}</li>)}</ul> : null}
      <Link href="/dashboard/children">عرض الطلاب</Link>
    </section> : null}
  </div>;
}
