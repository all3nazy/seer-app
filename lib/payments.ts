/** Online payment gateways and methods offered to families. */
export const providers = ["none", "sandbox", "moyasar", "hyperpay", "tap", "paytabs"] as const;
export type Provider = (typeof providers)[number];
export const providerLabels: Record<Provider, string> = { none: "غير مفعّل", sandbox: "وضع التجربة (بدون بوابة)", moyasar: "ميسّر Moyasar", hyperpay: "هايبر باي HyperPay", tap: "تاب Tap", paytabs: "باي تابز PayTabs" };
export const payMethods = ["mada", "visa_master", "apple_pay", "stc_pay", "tabby", "tamara"] as const;
export type PayMethod = (typeof payMethods)[number];
export const payMethodLabels: Record<PayMethod, string> = { mada: "مدى", visa_master: "فيزا / ماستركارد", apple_pay: "Apple Pay", stc_pay: "STC Pay", tabby: "تابي (قسّمها على ٤)", tamara: "تمارا (ادفع لاحقًا)" };
export const intentStatusLabels: Record<string, string> = { initiated: "بدأت", paid: "مدفوعة", needs_review: "تحتاج مراجعة", failed: "فشلت", cancelled: "ملغاة", expired: "منتهية" };
/** Live gateways the server can already settle once their keys are set. */
export const liveReady: Provider[] = ["moyasar"];
export function paymentSettingsValues(data: FormData) {
  const provider = String(data.get("provider") ?? "none");
  if (!providers.includes(provider as Provider)) throw new Error("بوابة غير صالحة.");
  const methods = data.getAll("methods").map(String).filter((m): m is PayMethod => payMethods.includes(m as PayMethod));
  if (!methods.length) throw new Error("اختر طريقة دفع واحدة على الأقل.");
  const mode = provider === "sandbox" ? "test" : data.get("mode") === "live" ? "live" : "test";
  const key = String(data.get("publishable_key") ?? "").trim();
  if (key && !/^[A-Za-z0-9_\-.]{8,200}$/.test(key)) throw new Error("المفتاح العام غير صالح.");
  return { provider, mode, methods: [...new Set(methods)], publishable_key: key || null, is_enabled: data.get("is_enabled") === "on" && provider !== "none" };
}
/** Moyasar amounts are in halalas. */
export const toHalalas = (sar: number) => Math.round(sar * 100);
export const fromHalalas = (halalas: number) => Math.round(halalas) / 100;
