"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markAttendance } from "../app/dashboard/classes/actions";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { submitAbsenceNotice } from "../app/p/actions";
import { notify } from "./feedback";

export type Notice = { id: string; child_id: string; child: string; reason: string | null; starts_on: string; ends_on: string; handled: boolean; recorded: string | null };
/** Parents' absence notices for the day: one tap records the absence as excused. */
export function AbsenceNotices({ organizationId, notices }: { organizationId: string; notices: Notice[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!notices.length) return null;
  const excuse = (notice: Notice) => start(async () => {
    const result = await markAttendance(organizationId, notice.child_id, "excused");
    if (result.error) { notify(result.error, "error"); return; }
    await getSupabaseBrowserClient().from("absence_notices").update({ handled_at: new Date().toISOString() }).eq("id", notice.id);
    notify(`${notice.child}: غياب بعذر`, "info", "done");
    router.refresh();
  });
  return <section className="card notices" style={{ marginBottom: 16 }} aria-labelledby="notices-title">
    <h2 id="notices-title" style={{ fontSize: 17 }}>إشعارات غياب من أولياء الأمور</h2>
    <ul className="records">{notices.map(notice => <li key={notice.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <span><strong>{notice.child}</strong>{notice.reason ? ` — ${notice.reason}` : ""}<span className="hint" style={{ display: "block" }}>{notice.starts_on === notice.ends_on ? notice.starts_on : `${notice.starts_on} ← ${notice.ends_on}`}</span></span>
      {notice.recorded === "excused" ? <span className="chip-soft ok">سُجّل بعذر</span>
        : <button type="button" className="btn btn-sm btn-primary" disabled={pending} onClick={() => excuse(notice)}>سجّل غياب بعذر</button>}
    </li>)}</ul>
  </section>;
}

/** On the family portal: tell the school a child will be absent. */
export function AbsenceForm({ token, childId, childName }: { token: string; childId: string; childName: string }) {
  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  if (state === "sent") return <p className="portal-card" role="status">✓ وصل إشعار غياب {childName} للمدرسة. شكرًا لكم.</p>;
  if (!open) return <button type="button" className="btn" onClick={() => setOpen(true)}>إبلاغ عن غياب {childName}</button>;
  return <form className="portal-card absence-form" onSubmit={async event => {
    event.preventDefault(); setState("sending"); setError("");
    const result = await submitAbsenceNotice(token, childId, from, to < from ? from : to, reason);
    if (result.error) { setError(result.error); setState("idle"); } else setState("sent");
  }}>
    <strong>إبلاغ عن غياب {childName}</strong>
    <label>من<input type="date" value={from} min={today} onChange={event => setFrom(event.target.value)} required /></label>
    <label>إلى<input type="date" value={to} min={from} onChange={event => setTo(event.target.value)} required /></label>
    <label>السبب (اختياري)<input value={reason} onChange={event => setReason(event.target.value)} maxLength={300} placeholder="موعد طبي" /></label>
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    <span style={{ display: "flex", gap: 8 }}><button type="submit" className="btn btn-primary" disabled={state === "sending"}>{state === "sending" ? "جارٍ الإرسال…" : "إرسال"}</button><button type="button" className="btn" onClick={() => setOpen(false)}>إلغاء</button></span>
  </form>;
}
