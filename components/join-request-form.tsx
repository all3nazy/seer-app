"use client";
import { useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase";

const errors: Record<string, string> = {
  "22023": "تأكد من الأسماء والمدينة، ورقم الجوال بصيغة 05xxxxxxxx.",
  "54000": "وصلتنا طلبات كثيرة من هذا الجهاز اليوم. جرّب بكرة أو راسلنا على البريد.",
};

/** «تبي تنضم للتجربة؟»: the request goes to the Seer team; the hidden field catches simple bots. */
export function JoinRequestForm() {
  const [form, setForm] = useState({ org_name: "", org_type: "school", city: "", contact_name: "", phone: "", students: "", website: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(current => ({ ...current, [key]: event.target.value }));
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;
    setState("sending"); setError("");
    const students = Number(form.students.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))));
    const { error: rpcError } = await getSupabaseBrowserClient().rpc("submit_join_request", {
      org_name: form.org_name.trim(), org_type: form.org_type, city: form.city.trim(), contact_name: form.contact_name.trim(), phone: form.phone.trim(),
      students: Number.isFinite(students) && students > 0 ? Math.round(students) : null, website: form.website,
    });
    if (rpcError) { setError(errors[rpcError.code ?? ""] ?? "تعذر الإرسال الآن. حاول بعد قليل."); setState("idle"); return; }
    setState("sent");
  }
  if (state === "sent") return <p className="lp-join-done" role="status">✓ وصلنا طلبك. بنتواصل معكم على الجوال قريب، ونرسل لكم رابط الدعوة.</p>;
  return <form className="lp-join-form" onSubmit={submit} aria-busy={state === "sending"}>
    <label>اسم المنشأة<input value={form.org_name} onChange={set("org_name")} required minLength={2} maxLength={120} autoComplete="organization" /></label>
    <label>النوع<select value={form.org_type} onChange={set("org_type")}><option value="school">مدرسة</option><option value="nursery">حضانة</option><option value="kindergarten">روضة</option></select></label>
    <label>المدينة<input value={form.city} onChange={set("city")} required minLength={2} maxLength={60} autoComplete="address-level2" /></label>
    <label>اسم المسؤول<input value={form.contact_name} onChange={set("contact_name")} required minLength={2} maxLength={80} autoComplete="name" /></label>
    <label>الجوال<input value={form.phone} onChange={set("phone")} required inputMode="tel" dir="ltr" placeholder="05xxxxxxxx" maxLength={20} autoComplete="tel" /></label>
    <label>عدد الطلاب تقريبًا<input value={form.students} onChange={set("students")} inputMode="numeric" dir="ltr" maxLength={6} /></label>
    {/* Hidden from people; bots tend to fill every field. */}
    <label className="lp-hp" aria-hidden="true">الموقع<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} /></label>
    {error ? <p role="alert" className="lp-join-error">{error}</p> : null}
    <button type="submit" className="lp-btn light" disabled={state === "sending"}>{state === "sending" ? "جارٍ الإرسال…" : "أرسل طلب الانضمام"}</button>
  </form>;
}
