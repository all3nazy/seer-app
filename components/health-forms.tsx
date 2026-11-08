"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { repairCheck, resolveError } from "../app/dashboard/health/actions";
import { notify } from "./feedback";

export function RepairButton({ organizationId, checkId }: { organizationId: string; checkId: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn-sm btn-primary" disabled={pending} onClick={() => start(async () => {
    const result = await repairCheck(organizationId, checkId);
    notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info", result.error ? undefined : "done");
  })}>{pending ? "جارٍ الإصلاح…" : "إصلاح"}</button>;
}
export function RecheckButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn-primary" disabled={pending} onClick={() => start(() => { router.refresh(); notify("تم الفحص.", "info", "done"); })}>{pending ? "جارٍ الفحص…" : "فحص الآن"}</button>;
}
export function ResolveError({ fingerprint, status, resolution }: { fingerprint: string; status: string; resolution: string | null }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(resolution ?? "");
  const [pending, start] = useTransition();
  const save = (next: string) => start(async () => { const result = await resolveError(fingerprint, next, text); notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info"); if (!result.error) setOpen(false); });
  if (!open) return <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>{status === "new" ? "معالجة" : "تعديل الحل"}</button>;
  return <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
    <textarea rows={2} value={text} onChange={event => setText(event.target.value)} maxLength={1000} placeholder="وش السبب وكيف ينحل؟ (يظهر للمستخدم إذا تكرر الخطأ)" />
    <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <button type="button" className="btn btn-sm btn-primary" disabled={pending} onClick={() => save("resolved")}>انحل</button>
      <button type="button" className="btn btn-sm" disabled={pending || !text.trim()} onClick={() => save("known")}>معروف (اعرض الحل)</button>
      <button type="button" className="btn btn-sm" disabled={pending} onClick={() => save("ignored")}>تجاهل</button>
      <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>إلغاء</button>
    </span>
  </div>;
}
