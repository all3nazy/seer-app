import Link from "next/link";
import { notFound } from "next/navigation";
import { loadOrgContext } from "../../../../lib/org-context";
import { OrgUnavailable } from "../../../../components/org-unavailable";
import { LiveClass } from "../../../../components/live-class";
import { holidayOn } from "../../../../lib/academics";
import { riyadhToday } from "../../../../lib/students";
import { memberName, type Member } from "../../../../lib/team";
import type { LiveAttendance, LiveEvent, LivePickup } from "../../../../lib/live-class";
import { BackLink } from "../../../../components/back-link";

export const dynamic = "force-dynamic";
export const metadata = { title: "الفصل مباشر" };
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export default async function LiveClassPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ org?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const context = await loadOrgContext(query.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, userId } = context;
  const today = riyadhToday();
  const [sectionResult, studentsResult, membersResult, holidays] = await Promise.all([
    client.from("sections").select("id,name,capacity,homeroom_teacher_id,grade_levels(name)").eq("organization_id", org).eq("id", id).maybeSingle(),
    client.from("children").select("id,full_name").eq("organization_id", org).eq("status", "active").eq("section_id", id).order("full_name").limit(500),
    client.from("memberships").select("user_id,role,display_name").eq("organization_id", org),
    client.from("holidays").select("name,starts_on,ends_on").eq("organization_id", org).lte("starts_on", today).gte("ends_on", today).limit(1),
  ]);
  if (!sectionResult.data && !sectionResult.error) notFound();
  const students = (studentsResult.data ?? []) as { id: string; full_name: string }[];
  const ids = students.length ? students.map(student => student.id) : ["00000000-0000-0000-0000-000000000000"];
  const [attendance, pickups, events, health, homeBus] = await Promise.all([
    client.from("attendance").select("child_id,status,recorded_at").eq("organization_id", org).eq("attendance_date", today).in("child_id", ids),
    client.from("pickups").select("child_id,picked_by_name,picked_at").eq("organization_id", org).eq("pickup_date", today).in("child_id", ids),
    client.from("attendance_events").select("id,child_id,from_status,to_status,actor_id,created_at").eq("organization_id", org).eq("attendance_date", today).in("child_id", ids).order("created_at", { ascending: false }).limit(200),
    client.from("child_health").select("child_id,allergies,conditions").eq("organization_id", org).in("child_id", ids),
    // Boarding the home bus counts as leaving, like a hand-over.
    client.from("trip_events").select("child_id,at,transport_trips!inner(trip_date,direction)").eq("organization_id", org).eq("event", "boarded")
      .eq("transport_trips.trip_date", today).eq("transport_trips.direction", "to_home").in("child_id", ids),
  ]);
  const failed = sectionResult.error || studentsResult.error || attendance.error || pickups.error;
  const section = sectionResult.data as unknown as { id: string; name: string; capacity: number | null; homeroom_teacher_id: string | null; grade_levels: { name: string } | null } | null;
  const members = (membersResult.data ?? []) as Member[];
  const teacher = members.find(member => member.user_id === section?.homeroom_teacher_id);
  const alerts = new Set((health.data ?? []).filter(row => row.allergies || row.conditions).map(row => row.child_id as string));
  const actors = Object.fromEntries(members.map(member => [member.user_id, memberName(member, member.user_id === userId)]));
  const holiday = holidayOn(today, (holidays.data ?? []) as { name: string; starts_on: string; ends_on: string }[]);
  const orgParam = encodeURIComponent(org);
  return <>
    <BackLink href={`/dashboard/classes?org=${orgParam}`} label="رجوع إلى متابعة الفصول" />
    <nav className="hint" style={{ marginBottom: 8 }}><Link href={`/dashboard/classes?org=${orgParam}`}>متابعة الفصول</Link> ‹ {section?.grade_levels?.name}</nav>
    {failed || !section ? <p role="alert" className="info-banner">تعذر تحميل الفصل. أعد تحميل الصفحة.</p> : <>
      {holiday ? <p className="info-banner" style={{ marginBottom: 16 }}>اليوم إجازة: {holiday}.</p> : null}
      <LiveClass
        organizationId={org}
        title={`${section.grade_levels?.name ? `${section.grade_levels.name} — ` : ""}${section.name}`}
        teacher={teacher ? memberName(teacher, teacher.user_id === userId) : null}
        capacity={section.capacity}
        students={students.map(student => ({ ...student, alert: alerts.has(student.id) }))}
        attendance={(attendance.data ?? []) as LiveAttendance[]}
        pickups={[...(pickups.data ?? []) as LivePickup[], ...((homeBus.data ?? []) as { child_id: string; at: string }[]).filter(row => !(pickups.data ?? []).some(p => p.child_id === row.child_id)).map(row => ({ child_id: row.child_id, picked_by_name: "باص المدرسة 🚌", picked_at: row.at }))]}
        events={(events.error ? [] : events.data ?? []) as LiveEvent[]}
        actors={actors}
        pickupHref={`/dashboard/pickup?org=${orgParam}`}
        attendanceHref={`/dashboard/attendance?org=${orgParam}&day=${today}&section=${section.id}`}
      />
    </>}
  </>;
}
