"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markAttendance } from "../app/dashboard/classes/actions";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { attendanceLabels, attendanceStatuses, type AttendanceStatus } from "../lib/students";
import { initials, inClass, riyadhTime, seatCounts, seatLabels, seatsFor, timeline, type LiveAttendance, type LiveEvent, type LivePickup, type LiveStudent, type SeatState } from "../lib/live-class";
import { Icon } from "./icons";
import { notify } from "./feedback";

type Props = {
  organizationId: string; title: string; teacher: string | null; capacity: number | null;
  students: LiveStudent[]; attendance: LiveAttendance[]; pickups: LivePickup[]; events: LiveEvent[];
  actors: Record<string, string>; pickupHref: string; attendanceHref: string;
};
type Filter = "all" | SeatState;
const filters: { key: Filter; label: string }[] = [
  { key: "all", label: "الكل" }, { key: "pending", label: "لم يُسجّل" }, { key: "present", label: "حاضر" }, { key: "late", label: "متأخر" },
  { key: "absent", label: "غائب" }, { key: "excused", label: "بعذر" }, { key: "left", label: "انصرف" },
];

/**
 * A class as it is right now: every student as a seat coloured by where they are, one-tap status
 * changes, and a timeline of today's movements. Updates arrive through Supabase Realtime, with a
 * slow refresh as a fallback when the live connection is not available.
 */
export function LiveClass(props: Props) {
  const { organizationId, students, attendance, pickups, events, actors } = props;
  const router = useRouter();
  const [live, setLive] = useState<"connecting" | "live" | "polling">("connecting");
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // A change made here already comes back with the action's reply; its live echo is ignored for a moment.
  const quietUntil = useRef(0);
  const seats = useMemo(() => seatsFor(students, attendance, pickups), [students, attendance, pickups]);
  const counts = seatCounts(seats);
  const names = useMemo(() => new Map(students.map(student => [student.id, student.full_name])), [students]);
  const items = useMemo(() => timeline(events, pickups, names), [events, pickups, names]);

  // Seats whose state changed since the last render glow briefly, so live updates are noticeable.
  const previous = useRef<Map<string, SeatState> | null>(null);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  useEffect(() => {
    const now = new Map(seats.map(seat => [seat.student.id, seat.state]));
    if (previous.current) {
      const changed = new Set([...now].filter(([id, state]) => previous.current!.get(id) !== state).map(([id]) => id));
      if (changed.size) { setFlash(changed); const timer = window.setTimeout(() => setFlash(new Set()), 1600); previous.current = now; return () => window.clearTimeout(timer); }
    }
    previous.current = now;
  }, [seats]);

  useEffect(() => { setUpdatedAt(new Date()); }, [attendance, pickups, events]);

  useEffect(() => {
    let timer: number | undefined;
    const refresh = () => { if (Date.now() < quietUntil.current) return; window.clearTimeout(timer); timer = window.setTimeout(() => startTransition(() => router.refresh()), 400); };
    let channel: ReturnType<ReturnType<typeof getSupabaseBrowserClient>["channel"]> | null = null;
    let connected = false;
    try {
      const client = getSupabaseBrowserClient();
      const filterOrg = `organization_id=eq.${organizationId}`;
      channel = client.channel(`live-class-${organizationId}-${Math.random().toString(36).slice(2, 8)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "attendance", filter: filterOrg }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "pickups", filter: filterOrg }, refresh)
        .subscribe((status: string) => { connected = status === "SUBSCRIBED"; setLive(connected ? "live" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED" ? "polling" : "connecting"); });
    } catch { setLive("polling"); }
    // Fallback only: poll every 30 seconds while the live connection is down and the tab is visible.
    const poll = window.setInterval(() => { if (!connected && document.visibilityState === "visible") startTransition(() => router.refresh()); }, 30_000);
    // Coming back to the page refreshes it only when the live connection is down or after a long absence.
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
      if (!connected || (hiddenAt && Date.now() - hiddenAt > 60_000)) refresh();
      hiddenAt = 0;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearInterval(poll); window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibility); if (channel) void getSupabaseBrowserClient().removeChannel(channel); };
  }, [organizationId, router]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function mark(childId: string, status: AttendanceStatus) {
    setSaving(childId); setOpen(null);
    quietUntil.current = Date.now() + 3000;
    const result = await markAttendance(organizationId, childId, status);
    quietUntil.current = Date.now() + 2000;
    setSaving(null);
    if (result.error) notify(result.error, "error");
    // The action's reply already carries the refreshed class, live or not.
    else notify(`${names.get(childId) ?? "الطالب"}: ${attendanceLabels[status]}`, "info", "done");
  }

  const shown = seats.filter(seat => filter === "all" || seat.state === filter);
  const present = inClass(counts);
  const share = students.length ? Math.round((present / students.length) * 100) : 0;
  return <div className="live-class">
    <header className="live-head">
      <div>
        <h1>{props.title}</h1>
        <p className="hint">{[props.teacher ? `رائد الفصل: ${props.teacher}` : null, `${students.length.toLocaleString("ar-SA")} طالب${props.capacity ? ` من ${props.capacity.toLocaleString("ar-SA")}` : ""}`].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="live-status" aria-live="polite">
        <span className={`live-dot ${live}`} aria-hidden="true" />
        <span>{live === "live" ? "مباشر" : live === "connecting" ? "جارٍ الاتصال…" : "تحديث كل ٣٠ ثانية"}</span>
        <span className="hint">آخر تحديث {updatedAt.toLocaleTimeString("ar-SA", { hour: "numeric", minute: "2-digit" })}</span>
      </div>
    </header>

    <div className="live-ring-row">
      <div className="live-ring" style={{ ["--share" as string]: `${share}%` }} role="img" aria-label={`في الفصل الآن ${present} من ${students.length}`}>
        <div><strong>{present.toLocaleString("ar-SA")}</strong><span>في الفصل</span></div>
      </div>
      <div className="live-counts">
        {(["present", "late", "pending", "absent", "excused", "left"] as SeatState[]).map(state =>
          <button key={state} type="button" className={`live-count s-${state}`} aria-pressed={filter === state} onClick={() => setFilter(current => current === state ? "all" : state)}>
            <strong>{counts[state].toLocaleString("ar-SA")}</strong><span>{seatLabels[state]}</span>
          </button>)}
      </div>
    </div>

    <div className="live-layout">
      <section className="card live-seats-card" aria-labelledby="seats-title">
        <div className="section-head">
          <h2 id="seats-title" className="section-title">مقاعد الفصل</h2>
          <div className="segments" role="group" aria-label="تصفية الطلاب">
            {filters.map(item => <button key={item.key} type="button" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>{item.label}</button>)}
          </div>
        </div>
        {students.length === 0 ? <p className="empty">ما فيه طلاب في هذا الفصل بعد.</p> : shown.length === 0 ? <p className="empty">ما فيه طلاب بهذه الحالة الآن.</p> :
          <ul className="live-seats">
            {shown.map(seat => <li key={seat.student.id} className={`seat s-${seat.state}${flash.has(seat.student.id) ? " flash" : ""}${saving === seat.student.id ? " saving" : ""}`}>
              <button type="button" className="seat-face" onClick={() => setOpen(current => current === seat.student.id ? null : seat.student.id)}
                aria-expanded={open === seat.student.id} aria-label={`${seat.student.full_name}، ${seatLabels[seat.state]}${seat.since ? ` ${riyadhTime(seat.since)}` : ""}`}>
                <span className="seat-avatar" aria-hidden="true">{initials(seat.student.full_name)}</span>
                <span className="seat-name">{seat.student.full_name}</span>
                <span className="seat-state">{seatLabels[seat.state]}{seat.since ? ` · ${riyadhTime(seat.since)}` : ""}</span>
                {seat.pickedBy ? <span className="seat-note">مع {seat.pickedBy}</span> : null}
                {seat.student.alert ? <span className="seat-alert" title="لديه تنبيه صحي">!</span> : null}
              </button>
              {open === seat.student.id ? <div className="seat-menu" role="group" aria-label={`تسجيل حالة ${seat.student.full_name}`}>
                {seat.state === "left" ? <p className="hint">انصرف اليوم، وتعديل التسليم من صفحة التسليم.</p> : attendanceStatuses.map(status =>
                  <button key={status} type="button" className={`seat-option s-${status}`} aria-pressed={seat.state === status} onClick={() => mark(seat.student.id, status)}>{attendanceLabels[status]}</button>)}
                <Link className="seat-option link" href={`/dashboard/children/${seat.student.id}?org=${encodeURIComponent(organizationId)}`}>ملف الطالب</Link>
                {seat.state === "present" || seat.state === "late" ? <Link className="seat-option link" href={props.pickupHref}>تسليم لولي الأمر</Link> : null}
              </div> : null}
            </li>)}
          </ul>}
        <p className="hint" style={{ marginTop: 14 }}>اضغط على الطالب لتسجيل حالته. كل تغيير ينحفظ باسمك ووقته في سجل المنصة. <Link href={props.attendanceHref}>كشف الحضور الكامل</Link></p>
      </section>

      <aside className="card live-feed" aria-labelledby="feed-title">
        <h2 id="feed-title" className="section-title"><Icon name="clock" /> حركة اليوم</h2>
        {items.length === 0 ? <p className="empty">ما فيه حركة مسجّلة اليوم بعد.</p> :
          <ol className="feed">{items.slice(0, 60).map(item => <li key={item.key} className={`feed-item feed-${item.tone || "plain"}`}>
            <time dateTime={item.at}>{riyadhTime(item.at)}</time>
            <span>{item.text}{item.actorId && actors[item.actorId] ? <span className="hint"> — {actors[item.actorId]}</span> : null}</span>
          </li>)}</ol>}
      </aside>
    </div>
  </div>;
}
