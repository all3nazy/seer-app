import Link from "next/link";
import { loadOrgContext } from "../../../lib/org-context";
import { OrgSwitcher, OrgUnavailable } from "../../../components/org-unavailable";
import { FinishTrip, RemoveStop, RiderRow, RouteForm, StartTrip, StopForm, VehicleForm } from "../../../components/transport-forms";
import { defaultDirection, directionLabels, directions, riderState, type Direction, type TripEvent } from "../../../lib/transport";
import { riyadhToday } from "../../../lib/students";

export const dynamic = "force-dynamic";
export const metadata = { title: "النقل" };
const tabs = { today: "رحلات اليوم", routes: "المسارات", vehicles: "الباصات" } as const;
type Tab = keyof typeof tabs;
const hhmm = (value: string | null) => value ? value.slice(0, 5) : "—";

export default async function TransportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const context = await loadOrgContext(params.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager, organizations } = context;
  const tab: Tab = params.tab && params.tab in tabs ? params.tab as Tab : "today";
  const orgParam = encodeURIComponent(org);
  const [routesResult, vehiclesResult, staffResult, stopsResult] = await Promise.all([
    client.from("bus_routes").select("id,name,vehicle_id,supervisor_staff_id,notes").eq("organization_id", org).order("name"),
    client.from("vehicles").select("id,name,plate,capacity,driver_staff_id,is_active").eq("organization_id", org).order("name"),
    manager ? client.from("staff_profiles").select("id,full_name").eq("organization_id", org).eq("status", "active").order("full_name") : Promise.resolve({ data: [] }),
    client.from("route_stops").select("id,route_id,child_id,stop_name,stop_order,pickup_time,dropoff_time,children(full_name)").eq("organization_id", org).order("stop_order"),
  ]);
  const routes = (routesResult.data ?? []) as { id: string; name: string; vehicle_id: string | null; supervisor_staff_id: string | null; notes: string | null }[];
  const vehicles = (vehiclesResult.data ?? []) as { id: string; name: string; plate: string | null; capacity: number; driver_staff_id: string | null; is_active: boolean }[];
  const staff = ((staffResult.data ?? []) as { id: string; full_name: string }[]).map(item => ({ id: item.id, name: item.full_name }));
  const stops = (stopsResult.data ?? []) as unknown as { id: string; route_id: string; child_id: string; stop_name: string | null; stop_order: number; pickup_time: string | null; dropoff_time: string | null; children: { full_name: string } | null }[];
  const route = routes.find(item => item.id === params.route) ?? routes[0];
  const header = <>
    <header className="page-head">
      <div><h1>النقل</h1><p>باصات {orgName} ومساراتها، ومتابعة صعود ونزول الطلاب لحظة بلحظة.</p></div>
      <OrgSwitcher path="/dashboard/transport" current={org} organizations={organizations} extra={{ tab }} />
    </header>
    <nav className="segments" aria-label="أقسام النقل" style={{ marginBottom: 14 }}>{(Object.keys(tabs) as Tab[]).map(key => <Link key={key} href={`/dashboard/transport?org=${orgParam}&tab=${key}${route ? `&route=${route.id}` : ""}`} aria-current={key === tab ? "page" : undefined}>{tabs[key]}</Link>)}</nav>
  </>;

  if (tab === "vehicles") return <>{header}
    {manager ? <section className="card" style={{ marginBottom: 16 }}><h2>إضافة باص</h2><VehicleForm organizationId={org} staff={staff} /></section> : null}
    <section className="card">{vehicles.length ? <ul className="records">{vehicles.map(vehicle => { const riders = stops.filter(stop => routes.find(item => item.id === stop.route_id)?.vehicle_id === vehicle.id).length;
      return <li key={vehicle.id}><span><strong>🚌 {vehicle.name}</strong>{vehicle.plate ? <span dir="auto"> · {vehicle.plate}</span> : null} · السائق: {staff.find(item => item.id === vehicle.driver_staff_id)?.name ?? "—"}</span>
        <span className={`chip-soft ${riders > vehicle.capacity ? "rose" : ""}`}>{riders.toLocaleString("ar-SA")} / {vehicle.capacity.toLocaleString("ar-SA")} مقعد</span></li>; })}</ul> : <p className="empty">ما فيه باصات بعد.</p>}</section>
  </>;

  if (tab === "routes") {
    const { data: kids } = manager ? await client.from("children").select("id,full_name").eq("organization_id", org).order("full_name").limit(1000) : { data: [] };
    return <>{header}
      {manager ? <section className="card" style={{ marginBottom: 16 }}><details open={!routes.length}><summary><strong>مسار جديد</strong></summary><div style={{ marginTop: 12 }}><RouteForm organizationId={org} vehicles={vehicles.map(item => ({ id: item.id, name: item.name }))} staff={staff} /></div></details></section> : null}
      {routes.map(item => { const riders = stops.filter(stop => stop.route_id === item.id); return <section key={item.id} className="card" style={{ marginBottom: 14 }}>
        <div className="section-head"><h2>{item.name}</h2><span className="hint">{vehicles.find(vehicle => vehicle.id === item.vehicle_id)?.name ?? "بدون باص"} · {riders.length.toLocaleString("ar-SA")} طالب</span></div>
        {riders.length ? <div className="table-wrap"><table className="links-table" style={{ width: "100%" }}><thead><tr><th>#</th><th>الطالب</th><th>المحطة</th><th>الركوب</th><th>النزول</th>{manager ? <th></th> : null}</tr></thead>
          <tbody>{riders.map(stop => <tr key={stop.id}><td>{stop.stop_order.toLocaleString("ar-SA")}</td><td>{stop.children?.full_name}</td><td>{stop.stop_name ?? "—"}</td><td dir="ltr">{hhmm(stop.pickup_time)}</td><td dir="ltr">{hhmm(stop.dropoff_time)}</td>{manager ? <td><RemoveStop organizationId={org} id={stop.id} /></td> : null}</tr>)}</tbody></table></div> : <p className="hint">ما فيه طلاب على هذا المسار.</p>}
        {manager ? <details style={{ marginTop: 10 }}><summary>إضافة طالب</summary><div style={{ marginTop: 10 }}><StopForm organizationId={org} routeId={item.id} students={((kids ?? []) as { id: string; full_name: string }[]).map(kid => ({ id: kid.id, name: kid.full_name }))} /></div></details> : null}
      </section>; })}
      {!routes.length ? <p className="empty">ما فيه مسارات بعد.</p> : null}
    </>;
  }

  if (!route) return <>{header}<p className="info-banner">أضف باصًا ومسارًا من التبويبات فوق{manager ? "" : " (للمدير)"}.</p></>;
  const direction: Direction = directions.includes(params.direction as Direction) ? params.direction as Direction : defaultDirection();
  const today = riyadhToday();
  const { data: tripRow } = await client.from("transport_trips").select("id,started_at,finished_at").eq("route_id", route.id).eq("trip_date", today).eq("direction", direction).maybeSingle();
  const trip = tripRow as { id: string; started_at: string; finished_at: string | null } | null;
  const riders = stops.filter(stop => stop.route_id === route.id);
  const childIds = riders.length ? riders.map(stop => stop.child_id) : ["00000000-0000-0000-0000-000000000000"];
  const [eventsResult, phonesResult] = await Promise.all([
    trip ? client.from("trip_events").select("child_id,event").eq("trip_id", trip.id) : Promise.resolve({ data: [] }),
    client.from("child_guardians").select("child_id,relationship,guardians(phone)").eq("organization_id", org).in("child_id", childIds),
  ]);
  const events = new Map<string, TripEvent[]>();
  for (const row of (eventsResult.data ?? []) as { child_id: string; event: TripEvent }[]) events.set(row.child_id, [...(events.get(row.child_id) ?? []), row.event]);
  const phones = new Map<string, string>();
  for (const row of (phonesResult.data ?? []) as unknown as { child_id: string; relationship: string; guardians: { phone: string | null } | null }[]) if (row.guardians?.phone && (!phones.has(row.child_id) || row.relationship === "mother")) phones.set(row.child_id, row.guardians.phone);
  const states = riders.map(stop => riderState(events.get(stop.child_id) ?? []));
  const count = (state: string) => states.filter(value => value === state).length;
  const ordered = direction === "to_home" ? [...riders].reverse() : riders;
  return <>{header}
    <form className="toolbar" style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap", marginBottom: 16 }}>
      <input type="hidden" name="org" value={org} /><input type="hidden" name="tab" value="today" />
      <label>المسار<select name="route" defaultValue={route.id}>{routes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>الرحلة<select name="direction" defaultValue={direction}>{directions.map(item => <option key={item} value={item}>{directionLabels[item]}</option>)}</select></label>
      <button type="submit" className="btn">عرض</button>
    </form>
    {!trip ? <section className="card" style={{ textAlign: "center" }}><p>{riders.length.toLocaleString("ar-SA")} طالب على مسار {route.name}.</p>{riders.length ? <StartTrip organizationId={org} routeId={route.id} direction={direction} /> : <p className="hint">أضف الطلاب للمسار أولًا.</p>}</section> : <section className="card">
      <div className="section-head"><h2>{directionLabels[direction]} — {route.name}</h2>{trip.finished_at ? <span className="chip-soft ok">انتهت</span> : <FinishTrip organizationId={org} tripId={trip.id} waiting={count("waiting")} />}</div>
      <div className="chip-row" style={{ margin: "8px 0 12px" }}><span className="chip-soft">بالانتظار {count("waiting").toLocaleString("ar-SA")}</span><span className="chip-soft sky">في الباص {count("on_bus").toLocaleString("ar-SA")}</span><span className="chip-soft ok">وصلوا {count("dropped").toLocaleString("ar-SA")}</span><span className="chip-soft rose">ما ركبوا {count("absent").toLocaleString("ar-SA")}</span></div>
      <ol className="riders">{ordered.map(stop => <RiderRow key={stop.child_id} organizationId={org} tripId={trip.id} child={{ id: stop.child_id, name: stop.children?.full_name ?? "طالب" }} stop={stop.stop_name}
        events={events.get(stop.child_id) ?? []} direction={direction} route={route.name} phone={phones.get(stop.child_id) ?? null} finished={Boolean(trip.finished_at)} />)}</ol>
      <p className="hint" style={{ marginTop: 10 }}>كل صعود ونزول ينسجل بالوقت واسمك، ويظهر لولي الأمر في بوابته.</p>
    </section>}
  </>;
}
