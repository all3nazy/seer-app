/**
 * Organization invite links. The token goes after "#" in the address, so the browser never sends it
 * to the web server (it is not in request logs or referrers); the page reads it and sends it to the
 * database in a request body only.
 */
export const invitePath = "/invite";
export const inviteLink = (origin: string, token: string) => `${origin.replace(/\/$/, "")}${invitePath}#${token}`;
export const isInviteToken = (value: string) => /^[A-HJ-NP-Za-km-z2-9]{32}$/.test(value);

export const orgTypeLabels: Record<string, string> = { school: "مدرسة", nursery: "حضانة", kindergarten: "روضة" };
export const inviteStatusLabels: Record<string, string> = { pending: "بانتظار", used: "مستخدمة", expired: "منتهية", revoked: "ملغاة" };
const months = (n: number) => n === 1 ? "شهر" : n === 2 ? "شهرين" : n <= 10 ? `${n.toLocaleString("ar-SA")} أشهر` : `${n.toLocaleString("ar-SA")} شهرًا`;
export const trialLabel = months;

/** The WhatsApp message for the owner, in everyday Saudi Arabic. */
export function inviteMessage(orgName: string, trialMonths: number, link: string): string {
  return [
    "السلام عليكم ورحمة الله،",
    `حيّاكم الله في سِير 🌿 هذا رابط تفعيل «${orgName}» على المنصة، والتجربة مجانية لمدة ${months(trialMonths)}.`,
    "افتحوا الرابط، واكتبوا اسمكم واختاروا اسم مستخدم وكلمة مرور، وتدخلون على طول بدون أي إيميل:",
    link,
    "الرابط صالح ٧ أيام ولمرة وحدة، فلا تشاركونه مع أحد. وإذا احتجتوا أي مساعدة احنا موجودين.",
  ].join("\n");
}

/** Arabic text for a refused link. */
export const inviteReasons: Record<string, string> = {
  invalid: "الرابط غير صحيح. تأكد إنك فتحته كامل من الرسالة.",
  used: "هذا الرابط استُخدم من قبل، والمنشأة مفعّلة. سجّل دخولك بحسابك.",
  expired: "انتهت صلاحية الرابط (٧ أيام). اطلب من فريق سِير رابطًا جديدًا.",
  revoked: "هذا الرابط أُلغي. اطلب من فريق سِير رابطًا جديدًا.",
  blocked: "محاولات كثيرة غير صحيحة. انتظر ربع ساعة ثم افتح الرابط من الرسالة مرة ثانية.",
};
