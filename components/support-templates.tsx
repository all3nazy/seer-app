"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { templatePages, templatePathPattern, templateText, type SupportTemplate } from "../lib/support-templates";
import { notify } from "./feedback";

type Draft = { id: number | null; title: string; body: string; path: string; keywords: string };
const empty: Draft = { id: null, title: "", body: "", path: "", keywords: "" };
const errorText = (code?: string) => code === "42501" ? "لمسؤول المنصة فقط." : code === "22023" ? "تحقق من العنوان (٢ إلى ٦٠ حرف) والنص (٥ إلى ١٥٠٠ حرف) والصفحة." : code === "P0002" ? "القالب ما عاد موجود. حدّث الصفحة." : "تعذر الحفظ. حاول مرة ثانية.";

/** The templates list with order (up/down), on/off and edit, and the add/edit form with a live preview. */
export function SupportTemplatesEditor({ templates, site }: { templates: SupportTemplate[]; site: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  // Browser-side calls (not server actions): the list is refreshed once after each change.
  const refresh = () => startTransition(() => router.refresh());
  const base = site || (typeof window === "undefined" ? "" : window.location.origin);
  const save = (template: { id: number | null; title: string; body: string; path: string | null; keywords: string[] | null; sort_order: number | null; is_active: boolean | null }) =>
    getSupabaseBrowserClient().rpc("admin_save_support_template", { template: template.id, title: template.title, body: template.body, path: template.path, keywords: template.keywords, sort_order: template.sort_order, is_active: template.is_active });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    const path = draft.path.trim() || null;
    if (path && !templatePathPattern.test(path)) { notify("الصفحة لازم تكون داخل المنصة، مثل /dashboard/team", "error"); return; }
    setBusy(true);
    const keywords = draft.keywords.split(/[,،\n]/).map(word => word.trim()).filter(Boolean);
    const last = templates.reduce((max, template) => Math.max(max, template.sort_order), 0);
    const { error } = await save({ id: draft.id, title: draft.title.trim(), body: draft.body.trim(), path, keywords, sort_order: draft.id ? null : last + 10, is_active: draft.id ? null : true });
    setBusy(false);
    if (error) { notify(errorText(error.code), "error"); return; }
    notify(draft.id ? "حُفظ القالب." : "أُضيف القالب.", "info", "done");
    setDraft(null);
    refresh();
  }
  async function toggle(template: SupportTemplate) {
    const { error } = await save({ ...template, is_active: !template.is_active });
    if (error) { notify(errorText(error.code), "error"); return; }
    notify(template.is_active ? "عُطّل القالب." : "فُعّل القالب.", "info", "done");
    refresh();
  }
  // Moving swaps the order with the neighbour (the list is shown in order).
  async function move(index: number, step: -1 | 1) {
    const one = templates[index], other = templates[index + step];
    if (!one || !other || busy) return;
    setBusy(true);
    const [a, b] = one.sort_order === other.sort_order ? [other.sort_order + step, one.sort_order] : [other.sort_order, one.sort_order];
    const first = await save({ ...one, sort_order: a, is_active: null });
    const second = first.error ? first : await save({ ...other, sort_order: b, is_active: null });
    setBusy(false);
    if (second.error) { notify(errorText(second.error.code), "error"); return; }
    refresh();
  }

  const pageLabel = (path: string | null) => path ? templatePages.find(page => page.path === path)?.label ?? path : "بدون صفحة";
  const form = draft ? <form className="template-form" onSubmit={submit} aria-label={draft.id ? "تعديل القالب" : "قالب جديد"}>
    <label>العنوان<input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} required minLength={2} maxLength={60} placeholder="مثال: إضافة موظف" /></label>
    <label>نص الرد<textarea value={draft.body} onChange={event => setDraft({ ...draft, body: event.target.value })} required minLength={5} maxLength={1500} placeholder="خطوات قصيرة باللهجة العامة" /></label>
    <label>الصفحة داخل المنصة (يُضاف رابطها آخر الرد)<select value={draft.path} onChange={event => setDraft({ ...draft, path: event.target.value })}>
      <option value="">بدون صفحة</option>
      {draft.path && !templatePages.some(page => page.path === draft.path) ? <option value={draft.path}>{draft.path}</option> : null}
      {templatePages.map(page => <option key={page.path} value={page.path}>{page.label} ({page.path})</option>)}
    </select></label>
    <label>كلمات للاقتراح (يفصلها فاصلة)<input value={draft.keywords} onChange={event => setDraft({ ...draft, keywords: event.target.value })} placeholder="حضور، غياب، تأخير" /></label>
    {draft.body.trim() ? <div><span className="hint">كذا يوصل للمستخدم:</span><p className="template-preview">{templateText({ body: draft.body, path: draft.path || null }, base)}</p></div> : null}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "جارٍ الحفظ…" : draft.id ? "حفظ التعديل" : "أضف القالب"}</button>
      <button type="button" className="btn" onClick={() => setDraft(null)}>إلغاء</button>
    </div>
  </form> : null;

  return <section className="card" aria-labelledby="templates-title">
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
      <h2 id="templates-title" style={{ margin: 0, fontSize: 18 }}>القوالب ({templates.length.toLocaleString("ar-SA")})</h2>
      <button type="button" className="btn btn-primary" onClick={() => setDraft({ ...empty })} disabled={draft?.id === null}>قالب جديد</button>
    </div>
    {draft?.id === null ? form : null}
    {templates.length ? <ul className="template-list">{templates.map((template, index) => <li key={template.id} className={template.is_active ? "" : "off"}>
      {draft?.id === template.id ? <div style={{ gridColumn: "1/-1" }}>{form}</div> : <>
        <span><strong>{template.title}</strong>{template.is_active ? null : <> <span className="chip-soft rose">معطّل</span></>}
          <span className="hint" style={{ display: "block" }}>{pageLabel(template.path)}{template.keywords.length ? ` · ${template.keywords.slice(0, 5).join("، ")}` : ""}</span></span>
        <span className="template-actions">
          <button type="button" className="btn btn-sm" aria-label={`رفع «${template.title}»`} disabled={busy || index === 0} onClick={() => void move(index, -1)}>↑</button>
          <button type="button" className="btn btn-sm" aria-label={`إنزال «${template.title}»`} disabled={busy || index === templates.length - 1} onClick={() => void move(index, 1)}>↓</button>
          <button type="button" className="btn btn-sm" onClick={() => setDraft({ id: template.id, title: template.title, body: template.body, path: template.path ?? "", keywords: template.keywords.join("، ") })}>تعديل</button>
          <button type="button" className="btn btn-sm" onClick={() => void toggle(template)}>{template.is_active ? "تعطيل" : "تفعيل"}</button>
        </span>
      </>}
    </li>)}</ul> : <p className="empty">ما فيه قوالب بعد. اضغط «قالب جديد».</p>}
  </section>;
}
