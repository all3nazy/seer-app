/** Helpers to hand a message to WhatsApp or the mail app. Nothing is sent from the server. */

/** Digits in international form for wa.me: 05xxxxxxxx → 9665xxxxxxxx; +966… → 966…. */
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (/^05\d{8}$/.test(digits)) return `966${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) return `966${digits}`;
  if (/^00\d{8,15}$/.test(digits)) return digits.slice(2);
  return /^\d{8,15}$/.test(digits) ? digits : null;
}
export function whatsappLink(phone: string | null | undefined, text: string): string {
  const number = whatsappNumber(phone);
  return `https://wa.me/${number ?? ""}?text=${encodeURIComponent(text)}`;
}
export function mailtoLink(email: string | null | undefined, subject: string, body: string): string {
  return `mailto:${email ? encodeURIComponent(email) : ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function taskMessage({ organization, title, due, link, name }: { organization: string; title: string; due: string | null; link: string; name?: string | null }): { subject: string; body: string } {
  const greeting = name ? `هلا ${name}،` : "هلا،";
  const lines = [
    greeting,
    `عندك مهمة من إدارة ${organization}: «${title}»`,
    due ? `موعد التسليم: ${due}` : null,
    `افتحها وحدّث حالتها من هنا (بعد تسجيل الدخول بحسابك): ${link}`,
  ].filter(Boolean);
  return { subject: `مهمة جديدة: ${title}`, body: lines.join("\n") };
}
export function myTasksMessage({ organization, link, name }: { organization: string; link: string; name?: string | null }): { subject: string; body: string } {
  return {
    subject: `رابط مهامك في ${organization}`,
    body: [name ? `هلا ${name}،` : "هلا،", `هذا رابط صفحة مهامك في ${organization} على سِير. تشوف فيه المهام المسندة لك من الإدارة وترفع استفساراتك:`, link, "يفتح بعد تسجيل الدخول بحسابك."].join("\n"),
  };
}
