import { mailtoLink, whatsappLink, whatsappNumber } from "../lib/share";

/** WhatsApp and email buttons with a prefilled message. Without a phone, WhatsApp asks whom to send to. */
export function ShareButtons({ phone, email, subject, body, compact }: { phone?: string | null; email?: string | null; subject: string; body: string; compact?: boolean }) {
  const size = compact ? " btn-sm" : "";
  return <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
    <a className={`btn${size}`} href={whatsappLink(phone, body)} target="_blank" rel="noreferrer" title={whatsappNumber(phone) ? undefined : "ما فيه رقم مسجّل؛ بتختار جهة الاتصال من واتساب"}>واتساب</a>
    <a className={`btn${size}`} href={mailtoLink(email, subject, body)} title={email ? undefined : "ما فيه بريد معروف؛ اكتبه في برنامج البريد"}>إيميل</a>
  </span>;
}
