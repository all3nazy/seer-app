/**
 * Fixed formatting for dates, times and numbers, without Intl or toLocale*: the server (Node's ICU)
 * and each browser format "ar-SA" differently (calendar, special spaces, digits), which breaks
 * hydration (React #418). Riyadh is UTC+3 all year (no daylight saving). Gregorian months in Arabic,
 * Arabic-Indic digits, 12-hour clock with ص/م.
 */
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
export const arabicMonths = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
export const arabicWeekdays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

type DateInput = string | number | Date;
type Parts = { year: number; month: number; day: number; weekday: number; hour: number; minute: number };

/** Western digits to Arabic-Indic (٠-٩). */
export function arDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, digit => String.fromCharCode(0x0660 + Number(digit)));
}

/**
 * A number in the "ar-SA" style: grouping ٬, decimal ٫, Arabic-Indic digits. By default up to 3
 * decimals; `min`/`max` fix the decimals (money: 2), `grouping: false` for invoice numbers.
 */
export function arNumber(value: number | null | undefined, options: { min?: number; max?: number; grouping?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const max = Math.max(options.max ?? 3, options.min ?? 0), min = options.min ?? 0;
  const [whole, fraction = ""] = Math.abs(value).toFixed(max).split(".");
  let decimals = fraction.replace(/0+$/, "");
  if (decimals.length < min) decimals = decimals.padEnd(min, "0");
  const grouped = options.grouping === false ? whole : whole.replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
  const negative = value < 0 && (Number(whole) > 0 || /[1-9]/.test(decimals));
  return `${negative ? "؜-" : ""}${arDigits(grouped)}${decimals ? `٫${arDigits(decimals)}` : ""}`;
}

function toMs(value: DateInput): number {
  return value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
}

/** The date and time on the Riyadh clock. */
export function riyadhParts(value: DateInput): Parts {
  const shifted = new Date(toMs(value) + RIYADH_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate(), weekday: shifted.getUTCDay(), hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() };
}

/** The hour now in Riyadh (0–23). */
export function riyadhHour(now: DateInput = Date.now()): number { return riyadhParts(now).hour; }

/** Today's date in Riyadh as YYYY-MM-DD. */
export function riyadhDate(now: DateInput = Date.now()): string {
  const { year, month, day } = riyadhParts(now);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** «٨:٠٥ ص» (12-hour; 00:xx is ١٢ ص, 12:xx is ١٢ م). */
export function formatTime(value: DateInput): string {
  const { hour, minute } = riyadhParts(value);
  return `${arDigits(hour % 12 || 12)}:${arDigits(String(minute).padStart(2, "0"))} ${hour < 12 ? "ص" : "م"}`;
}

/** «١٢ نوفمبر» (add the year with `year: true`). */
export function formatDate(value: DateInput, options: { year?: boolean; weekday?: boolean } = {}): string {
  const { year, month, day, weekday } = riyadhParts(value);
  return `${options.weekday ? `${arabicWeekdays[weekday]}، ` : ""}${arDigits(day)} ${arabicMonths[month]}${options.year ? ` ${arDigits(year)}` : ""}`;
}

/** «١٢ نوفمبر، ٨:٠٥ م». */
export function formatDateTime(value: DateInput): string {
  return `${formatDate(value)}، ${formatTime(value)}`;
}

/** «الخميس، ١٢ نوفمبر ٢٠٢٦، ٨:٠٥ م». */
export function formatFullDateTime(value: DateInput): string {
  return `${formatDate(value, { weekday: true, year: true })}، ${formatTime(value)}`;
}

/** A calendar day (YYYY-MM-DD, no time): «١٢ نوفمبر», read as that day wherever the page runs. */
export function formatDay(day: string, options: { year?: boolean; weekday?: boolean } = {}): string {
  return formatDate(Date.parse(`${day}T00:00:00Z`) - RIYADH_OFFSET_MS, options);
}

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
