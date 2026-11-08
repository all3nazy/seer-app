import { describe, expect, it } from "vitest";
import { inClass, initials, seatCounts, seatsFor, timeline } from "../lib/live-class";

const students = [{ id: "a", full_name: "ريم خالد", alert: false }, { id: "b", full_name: "سارة", alert: true }, { id: "c", full_name: "نورة علي", alert: false }, { id: "d", full_name: "هند", alert: false }];
describe("live class", () => {
  it("places each student: pickup wins, then attendance, else pending", () => {
    const seats = seatsFor(students,
      [{ child_id: "a", status: "present", recorded_at: "2026-11-08T05:00:00Z" }, { child_id: "b", status: "late", recorded_at: "2026-11-08T05:20:00Z" }, { child_id: "c", status: "present", recorded_at: "2026-11-08T05:01:00Z" }],
      [{ child_id: "c", picked_by_name: "الأم", picked_at: "2026-11-08T09:00:00Z" }]);
    expect(seats.map(seat => seat.state)).toEqual(["present", "late", "left", "pending"]);
    expect(seats[2]).toMatchObject({ since: "2026-11-08T09:00:00Z", pickedBy: "الأم" });
    const counts = seatCounts(seats);
    expect(counts).toMatchObject({ present: 1, late: 1, left: 1, pending: 1, absent: 0 });
    expect(inClass(counts)).toBe(2);
  });
  it("builds a newest-first timeline of attendance changes and pickups", () => {
    const names = new Map(students.map(s => [s.id, s.full_name]));
    const items = timeline([
      { id: 1, child_id: "a", from_status: null, to_status: "absent", actor_id: "u", created_at: "2026-11-08T05:00:00Z" },
      { id: 2, child_id: "a", from_status: "absent", to_status: "late", actor_id: "u", created_at: "2026-11-08T05:30:00Z" },
      { id: 3, child_id: "b", from_status: "present", to_status: null, actor_id: "u", created_at: "2026-11-08T05:10:00Z" },
    ], [{ child_id: "c", picked_by_name: "الأب", picked_at: "2026-11-08T09:00:00Z" }], names);
    expect(items.map(item => item.text)).toEqual(["نورة علي انصرف مع الأب", "ريم خالد: من غائب إلى متأخر", "أُلغي تسجيل سارة", "ريم خالد: غائب"]);
    expect(items[1].tone).toBe("coral");
  });
  it("initials take the first letters of two names", () => {
    expect(initials(" ريم  خالد العتيبي")).toBe("ر خ");
  });
});
