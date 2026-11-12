import { riyadhHour } from "./dates";
export const directions = ["to_school", "to_home"] as const;
export type Direction = (typeof directions)[number];
export const directionLabels: Record<Direction, string> = { to_school: "رحلة الذهاب (للمدرسة)", to_home: "رحلة العودة (للبيت)" };
export const tripEvents = ["boarded", "dropped", "absent"] as const;
export type TripEvent = (typeof tripEvents)[number];
export const eventLabels: Record<TripEvent, string> = { boarded: "صعد الباص", dropped: "نزل", absent: "ما ركب" };
/** Where a student is on a trip, from the events recorded so far. */
export function riderState(events: TripEvent[]): "waiting" | "on_bus" | "dropped" | "absent" {
  if (events.includes("absent")) return "absent";
  if (events.includes("dropped")) return "dropped";
  if (events.includes("boarded")) return "on_bus";
  return "waiting";
}
export const riderLabels = { waiting: "بالانتظار", on_bus: "في الباص", dropped: "وصل", absent: "ما ركب" } as const;
/** Default direction by Riyadh time: mornings go to school, afternoons go home. */
export function defaultDirection(now = new Date()): Direction {
  const hour = riyadhHour(now);
  return hour < 11 ? "to_school" : "to_home";
}
export function busMessage(child: string, event: TripEvent, direction: Direction, route: string): string {
  if (event === "boarded") return `🚌 ${child} صعد باص ${route} ${direction === "to_school" ? "متجه للمدرسة" : "متجه للبيت"}.`;
  if (event === "dropped") return direction === "to_school" ? `🏫 ${child} وصل المدرسة بالسلامة.` : `🏠 ${child} نزل من الباص عند البيت.`;
  return `ℹ️ ${child} ما ركب باص ${route} اليوم.`;
}
