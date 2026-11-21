import { arNumber } from "./dates";

/** Sign-in messages, shared by the server action and the forms (no server-only imports here). */
/** «توقف الدخول مؤقتًا…» with the minutes left (at least one). */
export function lockMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil((Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 0) / 60));
  return `توقف الدخول مؤقتًا بسبب محاولات كثيرة. حاول بعد ${arNumber(minutes)} ${minutes >= 3 && minutes <= 10 ? "دقائق" : "دقيقة"} أو تواصل مع إدارتك.`;
}

export const signInMessages = {
  // The same text for a wrong password and an unknown account: no account enumeration.
  invalid: "تعذر تسجيل الدخول. تحقق من اسم المستخدم أو البريد وكلمة المرور.",
  captcha: "تعذر التحقق من أنك لست برنامجًا آليًا. انتظر لحظة وحاول مرة ثانية.",
  busy: "محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مرة ثانية.",
  unavailable: "تعذر تسجيل الدخول الآن. حاول بعد قليل.",
  // An address on the platform's block list (no detail on why or for how long).
  blocked: "الدخول من هذه الشبكة موقوف. إذا تعتقد أن هذا خطأ تواصل مع فريق سِير.",
} as const;

