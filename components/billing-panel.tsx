"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { durationLabel, priceFor, riyal, type Duration, type Plan } from "../lib/subscriptions";
import { notify } from "./feedback";
import { arNumber } from "../lib/dates";

/** Pick a plan and a duration, transfer the amount, upload the receipt and send the reference. */
export function BillingPanel({ organizationId, plans, durations, currentPlan, accounts }: { organizationId: string; plans: Plan[]; durations: Duration[]; currentPlan: string | null; accounts: { bank: string; holder: string; iban: string }[] }) {
  const router = useRouter();
  const [plan, setPlan] = useState(currentPlan && plans.some(item => item.id === currentPlan) ? currentPlan : plans[plans.length - 1]?.id ?? "");
  const [months, setMonths] = useState(durations.find(item => item.months === 12)?.months ?? durations[0]?.months ?? 1);
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = plans.find(item => item.id === plan);
  const duration = durations.find(item => item.months === months);
  const amount = selected && duration ? priceFor(selected, duration) : 0;
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !selected || !duration) { notify("اختر الباقة والمدة وارفع صورة الإيصال.", "error"); return; }
    if (file.size > 5_000_000 || !/^(image\/(png|jpeg|webp)|application\/pdf)$/.test(file.type)) { notify("الإيصال صورة (PNG أو JPG) أو PDF حتى ٥ ميجابايت.", "error"); return; }
    setBusy(true);
    const client = getSupabaseBrowserClient();
    const extension = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `${organizationId}/${crypto.randomUUID()}.${extension}`;
    const upload = await client.storage.from("subscription-receipts").upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) { notify("تعذر رفع الإيصال. حاول مرة ثانية.", "error"); setBusy(false); return; }
    const { error } = await client.rpc("submit_subscription_payment", { org: organizationId, plan: selected.id, months: duration.months, reference: reference.trim(), receipt_path: path });
    setBusy(false);
    if (error) { notify(error.code === "54000" ? "عندك طلبات قيد المراجعة؛ انتظر اعتمادها." : "تعذر إرسال الطلب. تحقق من رقم المرجع.", "error"); return; }
    notify("وصل طلبك وهو قيد المراجعة. يوصلك إشعار عند الاعتماد.", "info", "done");
    setFile(null); setReference("");
    router.refresh();
  }
  return <section className="card" style={{ marginTop: 16, display: "grid", gap: 14 }}>
    <h2 style={{ margin: 0 }}>التجديد أو الترقية</h2>
    <div className="plan-pick" role="radiogroup" aria-label="الباقة">{plans.map(item => <button key={item.id} type="button" role="radio" aria-checked={item.id === plan} className={`plan-option${item.id === plan ? " is-picked" : ""}`} onClick={() => setPlan(item.id)}>
      <strong>{item.name}</strong><span>{riyal(item.monthly_price)} شهريًا</span>
    </button>)}</div>
    <div className="segments" role="radiogroup" aria-label="المدة">{durations.map(item => <button key={item.months} type="button" role="radio" aria-checked={item.months === months} className="pick" aria-pressed={item.months === months} onClick={() => setMonths(item.months)}>
      {durationLabel(item.months)}{Number(item.discount) ? ` · خصم ${arNumber(Number(item.discount))}٪` : ""}
    </button>)}</div>
    <p className="billing-amount">المبلغ: <strong>{riyal(amount)}</strong> <span className="hint">(يُحسب ويتأكد في النظام)</span></p>
    <div className="bank-list">{accounts.length ? accounts.map(account => <div key={account.iban} className="bank-item">
      <strong>{account.bank}</strong><span>{account.holder}</span>
      <span dir="ltr" className="iban">{account.iban}</span>
      <button type="button" className="btn btn-sm" onClick={() => { void navigator.clipboard?.writeText(account.iban); notify("نُسخ الآيبان.", "info", "done"); }}>نسخ الآيبان</button>
    </div>) : <p className="hint">بيانات الحساب البنكي تظهر هنا بعد ما يضيفها فريق سِير.</p>}</div>
    <form className="composer" onSubmit={send}>
      <label>صورة الإيصال<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={event => setFile(event.target.files?.[0] ?? null)} required /></label>
      <label>رقم مرجع التحويل<input dir="ltr" value={reference} onChange={event => setReference(event.target.value)} required minLength={3} maxLength={60} /></label>
      <button type="submit" className="btn-primary" disabled={busy || !accounts.length}>{busy ? "جارٍ الإرسال…" : "إرسال للمراجعة"}</button>
    </form>
  </section>;
}
