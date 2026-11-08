"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { recordPickup, saveAuthorizedPickup, setAuthorizedActive, undoPickup } from "../app/dashboard/pickup/actions";
import { notify } from "./feedback";

export type PickupPerson = { key: string; name: string; relation: string; phone: string | null };

/** One student awaiting pickup: choose who is collecting, confirm, done. */
export function PickupRow({ organizationId, childId, childName, people, attendance, alert }: { organizationId: string; childId: string; childName: string; people: PickupPerson[]; attendance: string | null; alert: boolean }) {
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState(people.length === 1 ? people[0].key : "");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return <li className="list-row" style={{ display: "grid", gap: 10, cursor: "default" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span className="body"><span className="title">{childName}</span>
        <span className="sub">{[attendance, alert ? "تنبيه صحي" : null].filter(Boolean).join(" · ") || "—"}</span></span>
      <button type="button" className={open ? "btn" : "btn-primary"} onClick={() => setOpen(value => !value)} aria-expanded={open}>{open ? "إغلاق" : "تسليم"}</button>
    </div>
    {open ? people.length ? <div style={{ display: "grid", gap: 8 }}>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 6 }}>
        <legend className="hint" style={{ marginBottom: 4 }}>من يستلم؟</legend>
        {people.map(item => <label key={item.key} style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 400, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 12 }}>
          <input type="radio" name={`person-${childId}`} value={item.key} checked={person === item.key} onChange={() => setPerson(item.key)} style={{ width: 20, minHeight: 20 }} />
          <span style={{ flex: 1 }}><strong>{item.name}</strong> <span className="hint">({item.relation})</span></span>
          {item.phone ? <a href={`tel:${item.phone}`} dir="ltr" onClick={event => event.stopPropagation()}>{item.phone}</a> : null}
        </label>)}
      </fieldset>
      <input value={note} onChange={event => setNote(event.target.value)} maxLength={200} placeholder="ملاحظة (اختياري)" aria-label={`ملاحظة تسليم ${childName}`} />
      <button type="button" className="btn-primary" disabled={!person || pending} onClick={() => start(async () => {
        const result = await recordPickup(organizationId, childId, person, note);
        notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info", result.error ? undefined : "done");
      })}>{pending ? "جارٍ التسجيل…" : "تأكيد التسليم"}</button>
    </div> : <p className="hint">ما فيه ولي أمر مربوط أو شخص مصرّح له. أضفهم من ملف الطالب على الكمبيوتر.</p> : null}
  </li>;
}

export function UndoPickupButton({ organizationId, pickupId }: { organizationId: string; pickupId: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn-sm" disabled={pending} onClick={() => start(async () => {
    const result = await undoPickup(organizationId, pickupId);
    notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info");
  })}>تراجع</button>;
}

export function AuthorizedPickupForm({ organizationId, childId }: { organizationId: string; childId: string }) {
  const [state, action, pending] = useActionState(saveAuthorizedPickup, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.success) { notify(state.success); form.current?.reset(); } }, [state]);
  return <form ref={form} action={action} className="composer">
    <input type="hidden" name="organization_id" value={organizationId} /><input type="hidden" name="child_id" value={childId} />
    <label>الاسم<input name="full_name" required maxLength={120} /></label>
    <label>الصلة<input name="relationship" required maxLength={40} placeholder="جد، خال، سائق…" /></label>
    <label>الجوال<input type="tel" name="phone" maxLength={16} dir="ltr" /></label>
    <label>رقم الهوية<input name="national_id" inputMode="numeric" maxLength={10} dir="ltr" /></label>
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "…" : "إضافة"}</button>
    {state.error ? <p role="alert" className="form-error" style={{ gridColumn: "1/-1" }}>{state.error}</p> : null}
  </form>;
}
export function AuthorizedToggle({ organizationId, childId, id, active }: { organizationId: string; childId: string; id: string; active: boolean }) {
  const [pending, start] = useTransition();
  return <button type="button" className={`btn btn-sm${active ? " btn-danger" : ""}`} disabled={pending} onClick={() => start(async () => {
    const result = await setAuthorizedActive(organizationId, childId, id, !active);
    notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info");
  })}>{active ? "إيقاف" : "تفعيل"}</button>;
}
