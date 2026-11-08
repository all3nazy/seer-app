import Link from "next/link";
import { loadOrgContext } from "../../../lib/org-context";
import { OrgSwitcher, OrgUnavailable } from "../../../components/org-unavailable";
import { PickupRow, UndoPickupButton, type PickupPerson } from "../../../components/pickup-forms";
import { sectionLabel } from "../../../lib/academics";
import { attendanceLabels, isAttendanceStatus, riyadhToday } from "../../../lib/students";
import { memberName, relationshipLabels, type Member, type Relationship } from "../../../lib/team";

export const dynamic = "force-dynamic";
export const metadata = { title: "تسليم الطلاب" };

type Pickup = { id: string; child_id: string; picked_by_name: string; picked_at: string; handed_by: string | null; note: string | null; pickup_confirmations: { confirmed_at: string | null; verified: boolean } | { confirmed_at: string | null; verified: boolean }[] | null };

export default async function PickupPage({ searchParams }: { searchParams: Promise<{ org?: string; section?: string }> }) {
  const params = await searchParams;
  const context = await loadOrgContext(params.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, organizations, manager, userId } = context;
  const today = riyadhToday();
  const [sections, grades] = await Promise.all([
    client.from("sections").select("id,name,grade_level_id").eq("organization_id", org).order("name"),
    client.from("grade_levels").select("id,name").eq("organization_id", org).order("sort_order"),
  ]);
  const gradeRows = (grades.data ?? []) as { id: string; name: string }[];
  const sectionOptions = ((sections.data ?? []) as { id: string; name: string; grade_level_id: string }[]).map(item => ({ id: item.id, name: sectionLabel(item, gradeRows) }));
  const section = sectionOptions.some(item => item.id === params.section) ? params.section : undefined;
  let kidsQuery = client.from("children").select("id,full_name").eq("organization_id", org).eq("status", "active");
  if (section) kidsQuery = kidsQuery.eq("section_id", section);
  const { data: kids, error } = await kidsQuery.order("full_name").limit(500);
  const ids = ((kids ?? []) as { id: string }[]).map(kid => kid.id);
  const [attendance, links, authorized, pickups, health, members, homeBus] = ids.length ? await Promise.all([
    client.from("attendance").select("child_id,status").eq("organization_id", org).eq("attendance_date", today).in("child_id", ids),
    client.from("child_guardians").select("child_id,relationship,guardians(id,full_name,phone)").eq("organization_id", org).in("child_id", ids),
    client.from("authorized_pickups").select("id,child_id,full_name,relationship,phone").eq("organization_id", org).eq("is_active", true).in("child_id", ids),
    client.from("pickups").select("id,child_id,picked_by_name,picked_at,handed_by,note,pickup_confirmations(confirmed_at,verified)").eq("organization_id", org).eq("pickup_date", today).in("child_id", ids),
    client.from("child_health").select("child_id,allergies,conditions").eq("organization_id", org).in("child_id", ids),
    client.from("memberships").select("user_id,role,display_name").eq("organization_id", org),
    client.from("trip_events").select("child_id,transport_trips!inner(trip_date,direction)").eq("organization_id", org).eq("event", "boarded")
      .eq("transport_trips.trip_date", today).eq("transport_trips.direction", "to_home").in("child_id", ids),
  ]) : Array.from({ length: 7 }, () => ({ data: [], error: null }));
  // Children who boarded the home bus have left; they are not waiting for a hand-over.
  const onBus = new Set(((homeBus.data ?? []) as { child_id: string }[]).map(row => row.child_id));
  const statusOf = new Map(((attendance.data ?? []) as { child_id: string; status: string }[]).map(row => [row.child_id, row.status]));
  const pickedUp = new Map(((pickups.data ?? []) as Pickup[]).map(row => [row.child_id, row]));
  const alerts = new Set(((health.data ?? []) as { child_id: string; allergies: string | null; conditions: string | null }[]).filter(row => row.allergies || row.conditions).map(row => row.child_id));
  const people = new Map<string, PickupPerson[]>();
  for (const link of (links.data ?? []) as unknown as { child_id: string; relationship: Relationship; guardians: { id: string; full_name: string; phone: string | null } | null }[]) {
    if (!link.guardians) continue;
    people.set(link.child_id, [...(people.get(link.child_id) ?? []), { key: `guardian:${link.guardians.id}`, name: link.guardians.full_name, relation: relationshipLabels[link.relationship] ?? "ولي أمر", phone: link.guardians.phone }]);
  }
  for (const item of (authorized.data ?? []) as { id: string; child_id: string; full_name: string; relationship: string; phone: string | null }[]) {
    people.set(item.child_id, [...(people.get(item.child_id) ?? []), { key: `authorized:${item.id}`, name: item.full_name, relation: `مصرّح له: ${item.relationship}`, phone: item.phone }]);
  }
  const rows = (kids ?? []) as { id: string; full_name: string }[];
  const absent = (id: string) => statusOf.get(id) === "absent" || statusOf.get(id) === "excused";
  const waiting = rows.filter(kid => !pickedUp.has(kid.id) && !absent(kid.id) && !onBus.has(kid.id));
  const done = rows.filter(kid => pickedUp.has(kid.id)).sort((a, b) => pickedUp.get(b.id)!.picked_at.localeCompare(pickedUp.get(a.id)!.picked_at));
  const away = rows.filter(kid => !pickedUp.has(kid.id) && absent(kid.id));
  const memberRows = (members.data ?? []) as Member[];
  const recent = Date.now() - 15 * 60_000;
  const label = (id: string) => { const status = statusOf.get(id); return isAttendanceStatus(status) ? attendanceLabels[status] : "ما تسجّل حضوره"; };
  return <>
    <header className="page-head">
      <div><h1>تسليم الطلاب</h1><p>{orgName}: سلّم كل طالب لولي أمره أو لشخص مصرّح له، وينحفظ الوقت ومن سلّمه.</p></div>
      <OrgSwitcher path="/dashboard/pickup" current={org} organizations={organizations} />
    </header>
    {sectionOptions.length ? <nav className="segments" aria-label="الشعبة">
      <Link href={`/dashboard/pickup?org=${encodeURIComponent(org)}`} aria-current={!section ? "page" : undefined}>الكل</Link>
      {sectionOptions.map(item => <Link key={item.id} href={`/dashboard/pickup?org=${encodeURIComponent(org)}&section=${item.id}`} aria-current={item.id === section ? "page" : undefined}>{item.name}</Link>)}
    </nav> : null}
    {error ? <p role="alert" className="info-banner">تعذر تحميل الطلاب. أعد تحميل الصفحة.</p> : <div style={{ display: "grid", gap: 24 }}>
      <section aria-labelledby="waiting-title">
        <h2 id="waiting-title" className="section-label" style={{ marginBottom: 8 }}>بانتظار التسليم ({waiting.length.toLocaleString("ar-SA")})</h2>
        {waiting.length ? <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {waiting.map(kid => <PickupRow key={kid.id} organizationId={org} childId={kid.id} childName={kid.full_name} people={people.get(kid.id) ?? []} attendance={label(kid.id)} alert={alerts.has(kid.id)} />)}
        </ul> : <p className="hint">{rows.length ? "كل الطلاب الحاضرين تسلّموا. 👏" : "ما فيه طلاب."}</p>}
      </section>
      {done.length ? <section aria-labelledby="done-title">
        <h2 id="done-title" className="section-label" style={{ marginBottom: 8 }}>تم التسليم ({done.length.toLocaleString("ar-SA")})</h2>
        <ul className="records">{done.map(kid => {
          const record = pickedUp.get(kid.id)!;
          const handedBy = memberRows.find(member => member.user_id === record.handed_by);
          return <li key={kid.id}>
            <span><strong>{kid.full_name}</strong>
              <span className="hint" style={{ display: "block" }}>استلمه {record.picked_by_name} · {new Date(record.picked_at).toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour: "numeric", minute: "2-digit" })} · سلّمه {memberName(handedBy, record.handed_by === userId)}{record.note ? ` · ${record.note}` : ""}</span>
              {(() => { const c = Array.isArray(record.pickup_confirmations) ? record.pickup_confirmations[0] : record.pickup_confirmations; return c ? <span className={`chip-soft ${c.confirmed_at ? "ok" : "coral"}`} style={{ marginTop: 4 }}>{c.confirmed_at ? (c.verified ? "✓ أكّد بالهوية" : "✓ أكّد") : "بانتظار تأكيد المستلم"}</span> : null; })()}</span>
            {manager || (record.handed_by === userId && Date.parse(record.picked_at) > recent) ? <UndoPickupButton organizationId={org} pickupId={record.id} /> : null}
          </li>;
        })}</ul>
      </section> : null}
      {away.length ? <details><summary>غائبين اليوم ({away.length.toLocaleString("ar-SA")})</summary>
        <ul className="records" style={{ marginTop: 8 }}>{away.map(kid => <li key={kid.id}><span>{kid.full_name}</span><span className="chip-soft rose">{label(kid.id)}</span></li>)}</ul>
      </details> : null}
    </div>}
  </>;
}
