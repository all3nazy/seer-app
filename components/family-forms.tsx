"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { saveDailyReport } from "../app/dashboard/daily/actions";
import { deleteAnnouncement, guardianPortalLink, saveAnnouncement, sendAnnouncementToFamilies } from "../app/dashboard/announcements/actions";
import { audienceLabels, audiences, meals, moodEmoji, moodLabels, moods, portalMessage, portionShort, portions, reportSummary, type DailyReport } from "../lib/family";
import { whatsappLink } from "../lib/share";
import { notify } from "./feedback";

/** One child's day: tap chips for mood and meals, quick numbers for nap and diapers, then save. */
export function DailyReportCard({ organizationId, day, child, report, editable, guardianPhone, showDiapers }: {
  organizationId: string; day: string; child: { id: string; full_name: string; alert: boolean }; report: DailyReport | null; editable: boolean; guardianPhone: string | null; showDiapers: boolean;
}) {
  const [state, action, pending] = useActionState(saveDailyReport, {});
  const [draft, setDraft] = useState<Partial<DailyReport>>(report ?? {});
  const [open, setOpen] = useState(false);
  useEffect(() => { if (state.success) notify(`${child.full_name}: ${state.success}`, "info", "done"); else if (state.error) notify(state.error, "error"); }, [state, child.full_name]);
  const set = (key: keyof DailyReport, value: unknown) => setDraft(current => ({ ...current, [key]: current[key] === value ? null : value }));
  const done = Boolean(report);
  return <article className={`daily-card${done ? " done" : ""}`}>
    <button type="button" className="daily-head" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      <span className="daily-mood" aria-hidden="true">{draft.mood ? moodEmoji[draft.mood] : "📝"}</span>
      <span><strong>{child.full_name}</strong>{child.alert ? <span className="chip-soft rose" style={{ marginInlineStart: 6 }}>تنبيه صحي</span> : null}
        <small>{done ? "تقرير اليوم محفوظ" : "ما تسجّل تقرير بعد"}</small></span>
    </button>
    {open ? <form action={action} className="daily-form">
      <input type="hidden" name="organization_id" value={organizationId} /><input type="hidden" name="child_id" value={child.id} /><input type="hidden" name="report_date" value={day} />
      {(["mood", "breakfast", "snack", "lunch"] as const).map(key => <input key={key} type="hidden" name={key} value={(draft[key] as string | null) ?? ""} />)}
      <div className="chip-row" role="group" aria-label="المزاج">{moods.map(mood => <button key={mood} type="button" className="pick" aria-pressed={draft.mood === mood} disabled={!editable} onClick={() => set("mood", mood)}>{moodEmoji[mood]} {moodLabels[mood]}</button>)}</div>
      {meals.map(([key, label]) => <div key={key} className="chip-row" role="group" aria-label={label}><span className="chip-label">{label}</span>
        {portions.map(portion => <button key={portion} type="button" className="pick" aria-pressed={draft[key] === portion} disabled={!editable} onClick={() => set(key, portion)}>{portionShort[portion]}</button>)}</div>)}
      <div className="daily-numbers">
        <label>النوم (دقيقة)<input name="nap_minutes" type="number" min={0} max={600} step={5} defaultValue={report?.nap_minutes ?? ""} disabled={!editable} onChange={event => setDraft(current => ({ ...current, nap_minutes: event.target.value === "" ? null : Number(event.target.value) }))} /></label>
        {showDiapers ? <label>تغيير الحفاض<input name="diapers" type="number" min={0} max={20} defaultValue={report?.diapers ?? ""} disabled={!editable} onChange={event => setDraft(current => ({ ...current, diapers: event.target.value === "" ? null : Number(event.target.value) }))} /></label> : null}
      </div>
      <label>الأنشطة<input name="activities" maxLength={500} defaultValue={report?.activities ?? ""} disabled={!editable} placeholder="رسم، قصة، لعب بالرمل…" onChange={event => setDraft(current => ({ ...current, activities: event.target.value }))} /></label>
      <label>الدواء المعطى<input name="medication" maxLength={300} defaultValue={report?.medication ?? ""} disabled={!editable} onChange={event => setDraft(current => ({ ...current, medication: event.target.value }))} /></label>
      <label>حادثة أو ملاحظة مهمة<input name="incident" maxLength={500} defaultValue={report?.incident ?? ""} disabled={!editable} onChange={event => setDraft(current => ({ ...current, incident: event.target.value }))} /></label>
      <label>كلمة لأهله<textarea name="notes" maxLength={1000} rows={2} defaultValue={report?.notes ?? ""} disabled={!editable} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} /></label>
      <div className="daily-actions">
        {editable ? <button type="submit" className="btn-primary" disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ التقرير"}</button> : <span className="hint">تعديل الأيام السابقة للمسؤول فقط.</span>}
        <a className="btn share-wa" href={whatsappLink(guardianPhone, reportSummary(child.full_name, draft))} target="_blank" rel="noopener noreferrer">إرسال لولي الأمر</a>
      </div>
    </form> : null}
  </article>;
}

export function AnnouncementForm({ organizationId, sections }: { organizationId: string; sections: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveAnnouncement, {});
  const [key, setKey] = useState(0);
  useEffect(() => { if (state.success) { notify(state.success, "info", "done"); setKey(value => value + 1); } else if (state.error) notify(state.error, "error"); }, [state]);
  return <form key={key} action={action} className="composer">
    <input type="hidden" name="organization_id" value={organizationId} />
    <label style={{ gridColumn: "1/-1" }}>العنوان<input name="title" required maxLength={120} placeholder="مثال: رحلة الخميس إلى حديقة الحيوان" /></label>
    <label style={{ gridColumn: "1/-1" }}>النص<textarea name="body" required maxLength={2000} rows={4} /></label>
    <label>لمن؟<select name="audience" defaultValue="all">{audiences.map(audience => <option key={audience} value={audience}>{audienceLabels[audience]}</option>)}</select></label>
    <label>الفصل<select name="section_id" defaultValue=""><option value="">كل الفصول</option>{sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
    <label className="quote-check"><input type="checkbox" name="pinned" /> تثبيت في الأعلى</label>
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "جارٍ النشر…" : "نشر"}</button>
    {state.error ? <p role="alert" className="form-error" style={{ gridColumn: "1/-1" }}>{state.error}</p> : null}
  </form>;
}
export function DeleteAnnouncement({ organizationId, id }: { organizationId: string; id: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={() => { if (window.confirm("حذف الإعلان؟")) start(async () => { const result = await deleteAnnouncement(organizationId, id); notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info"); }); }}>حذف</button>;
}

/** Sends a family announcement to guardians as messages (WhatsApp/SMS), once per guardian. */
export function SendAnnouncement({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn-sm" disabled={pending} onClick={() => { if (window.confirm("إرسال الإعلان لأولياء الأمور برسالة مع رابط البوابة؟")) start(async () => { const result = await sendAnnouncementToFamilies(id); notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info", result.error ? undefined : "done"); }); }}>{pending ? "جارٍ الإرسال…" : "إرسال للأهالي"}</button>;
}

/** Managers send a guardian their private portal link over WhatsApp. */
export function PortalLinkButton({ guardianId, guardianName, phone, organization }: { guardianId: string; guardianName: string; phone: string | null; organization: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fetchLink = (renew = false) => start(async () => {
    const result = await guardianPortalLink(guardianId, renew);
    if (result.error) notify(result.error, "error");
    else { setLink(result.link ?? null); if (result.success) notify(result.success, "info", "done"); }
  });
  if (!link) return <button type="button" className="btn btn-sm" disabled={pending} onClick={() => fetchLink()}>{pending ? "…" : "رابط البوابة"}</button>;
  return <span className="share-doc">
    <a className="btn btn-sm share-wa" href={whatsappLink(phone, portalMessage(organization, guardianName, link))} target="_blank" rel="noopener noreferrer">إرسال واتساب</a>
    <button type="button" className="btn btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(link); notify("نُسخ الرابط.", "info", "done"); } catch { notify(link); } }}>نسخ</button>
    <a className="btn btn-sm" href={link} target="_blank" rel="noopener noreferrer">معاينة</a>
    <button type="button" className="btn btn-sm" disabled={pending} onClick={() => { if (window.confirm("تجديد الرابط يوقف القديم. متأكد؟")) fetchLink(true); }}>تجديد</button>
  </span>;
}
