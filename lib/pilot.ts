import { featureKeys, type OrgFeatures } from "./subscriptions";

/**
 * The free pilot phase, switched on with SEER_PILOT_MODE=1 on the server (Vercel). While it is on:
 * sign-up is by invitation only, prices and transfers are hidden, the renewal banner does not show,
 * every organization gets every section, and parents' online payment is hidden.
 */
export function pilotMode(env: Record<string, string | undefined> = process.env): boolean {
  return env.SEER_PILOT_MODE === "1";
}

/** Sections not offered during the pilot (parents' online payment). */
export const pilotHiddenFeatures = ["online_payments"] as const;
export const pilotHides = (feature: string) => (pilotHiddenFeatures as readonly string[]).includes(feature);

/** The sections an organization sees: during the pilot every section except the hidden ones. */
export function effectiveSections(org: OrgFeatures, pilot: boolean): OrgFeatures {
  if (!pilot) return org;
  // Hidden sections stay "in the plan" but switched off, so they are hidden rather than shown with a lock.
  return { features: [...featureKeys], disabled: [...org.disabled.filter(key => !pilotHides(key)), ...pilotHiddenFeatures] };
}

export const pilotTexts = {
  signup: "التسجيل حاليًا بدعوة فقط خلال المرحلة التجريبية",
  pricing: "سِير مجاني خلال المرحلة التجريبية",
  billing: "اشتراكك مجاني خلال المرحلة التجريبية",
  payments: "الدفع الإلكتروني لأولياء الأمور غير متاح خلال المرحلة التجريبية.",
};
