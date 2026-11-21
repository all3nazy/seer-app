"use client";
import { useState, useTransition } from "react";
import { backupLink, backupNow, markErrorHandled } from "../app/admin/stage4-actions";
import { notify } from "./feedback";
import { confirmAction } from "./confirm";

export function BackupNowButton() {
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn-primary" disabled={pending} onClick={async () => {
    if (!(await confirmAction("أخذ نسخة احتياطية كاملة الحين؟ تاخذ دقيقة أو أكثر، ومسموح بنسخة يدوية كل ١٠ دقائق."))) return;
    start(async () => { const result = await backupNow(); notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info", result.error ? undefined : "done"); });
  }}>{pending ? "جارٍ النسخ…" : "نسخة الحين"}</button>;
}

/** Pick a file of a backup and download it through a short signed link (logged). */
export function BackupDownload({ run, files }: { run: number; files: string[] }) {
  const [pending, start] = useTransition();
  const [file, setFile] = useState("manifest.json");
  return <span className="adm-btn-row">
    <label className="sr-only" htmlFor={`file-${run}`}>الملف</label>
    <select id={`file-${run}`} value={file} onChange={event => setFile(event.target.value)}>
      <option value="manifest.json">manifest.json</option>{files.map(name => <option key={name} value={name}>{name}</option>)}
    </select>
    <button type="button" className="btn btn-sm" disabled={pending} onClick={() => start(async () => {
      const result = await backupLink(run, file);
      if (result.error || !result.url) { notify(result.error ?? "تعذر التحميل.", "error"); return; }
      window.location.assign(result.url);
    })}>تحميل<span className="sr-only"> {file}</span></button>
  </span>;
}

export function ErrorActions({ fingerprint }: { fingerprint: string }) {
  const [pending, start] = useTransition();
  const act = (status: "resolved" | "ignored") => start(async () => { const result = await markErrorHandled(fingerprint, status); notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info", result.error ? undefined : "done"); });
  return <span className="adm-btn-row">
    <button type="button" className="btn btn-sm" disabled={pending} onClick={() => act("resolved")}>تم حلّه</button>
    <button type="button" className="btn btn-sm" disabled={pending} onClick={() => act("ignored")}>تجاهل</button>
  </span>;
}
