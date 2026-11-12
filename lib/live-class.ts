import { attendanceLabels, type AttendanceStatus } from "./students";
import { formatTime } from "./dates";

/**
 * The live class view: where each student is right now, and a timeline of today's movements.
 * "Left" means the student was handed to a guardian; it wins over the attendance status.
 */
export type SeatState = AttendanceStatus | "left" | "pending";
export const seatLabels: Record<SeatState, string> = { ...attendanceLabels, left: "انصرف", pending: "لم يُسجّل" };
export const seatOrder: SeatState[] = ["pending", "present", "late", "left", "absent", "excused"];

export type LiveStudent = { id: string; full_name: string; alert: boolean };
export type LiveAttendance = { child_id: string; status: AttendanceStatus; recorded_at: string };
export type LivePickup = { child_id: string; picked_by_name: string; picked_at: string };
export type LiveEvent = { id: number; child_id: string; from_status: AttendanceStatus | null; to_status: AttendanceStatus | null; actor_id: string | null; created_at: string };
export type Seat = { student: LiveStudent; state: SeatState; since: string | null; pickedBy: string | null };

export function seatsFor(students: LiveStudent[], attendance: LiveAttendance[], pickups: LivePickup[]): Seat[] {
  const byChild = new Map(attendance.map(row => [row.child_id, row]));
  const left = new Map(pickups.map(row => [row.child_id, row]));
  return students.map(student => {
    const pickup = left.get(student.id);
    if (pickup) return { student, state: "left", since: pickup.picked_at, pickedBy: pickup.picked_by_name };
    const row = byChild.get(student.id);
    return row ? { student, state: row.status, since: row.recorded_at, pickedBy: null } : { student, state: "pending", since: null, pickedBy: null };
  });
}

export function seatCounts(seats: Seat[]): Record<SeatState, number> {
  const counts = Object.fromEntries(seatOrder.map(state => [state, 0])) as Record<SeatState, number>;
  for (const seat of seats) counts[seat.state] += 1;
  return counts;
}
/** Students physically in class: present or late and not yet handed over. */
export function inClass(counts: Record<SeatState, number>): number { return counts.present + counts.late; }

export type TimelineItem = { key: string; at: string; childId: string; text: string; tone: string; actorId: string | null };
export function timeline(events: LiveEvent[], pickups: LivePickup[], names: Map<string, string>): TimelineItem[] {
  const name = (id: string) => names.get(id) ?? "طالب";
  const items: TimelineItem[] = events.map(event => {
    const who = name(event.child_id);
    const text = event.to_status === null ? `أُلغي تسجيل ${who}`
      : event.from_status === null ? `${who}: ${attendanceLabels[event.to_status]}`
      : `${who}: من ${attendanceLabels[event.from_status]} إلى ${attendanceLabels[event.to_status]}`;
    const tone = event.to_status === "late" ? "coral" : event.to_status === "absent" ? "rose" : event.to_status === "present" ? "ok" : "";
    return { key: `a${event.id}`, at: event.created_at, childId: event.child_id, text, tone, actorId: event.actor_id };
  });
  for (const pickup of pickups) items.push({ key: `p${pickup.child_id}`, at: pickup.picked_at, childId: pickup.child_id, text: `${name(pickup.child_id)} انصرف مع ${pickup.picked_by_name}`, tone: "sky", actorId: null });
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

export function riyadhTime(iso: string): string {
  return formatTime(iso);
}
export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] ?? "").join(" ");
}
