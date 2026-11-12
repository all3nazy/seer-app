"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { finishTrip, recordRider, removeStop, saveRoute, saveStop, saveVehicle, startTrip, type BusResult } from "../app/dashboard/transport/actions";
import { busMessage, directionLabels, riderLabels, riderState, type Direction, type TripEvent } from "../lib/transport";
import { whatsappLink } from "../lib/share";
import { notify } from "./feedback";

type Option = { id: string; name: string };
function useToast(state: BusResult, after?: () => void) {
  useEffect(() => { if (state.success) { notify(state.success, "info", "done"); after?.(); } else if (state.error) notify(state.error, "error"); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
}
function useRun() {
  const [pending, start] = useTransition();
  return { pending, run: (work: () => Promise<BusResult>, quiet = false) => start(async () => { const result = await work(); if (result.error || !quiet) notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info", result.error ? undefined : "done"); }) };
}

export function VehicleForm({ organizationId, staff }: { organizationId: string; staff: Option[] }) {
  const [state, action, pending] = useActionState(saveVehicle, {});
  const [key, setKey] = useState(0);
  useToast(state, () => setKey(value => value + 1));
  return <form key={key} action={action} className="composer">
    <input type="hidden" name="organization_id" value={organizationId} />
    <label>اسم الباص<input name="name" required maxLength={60} placeholder="باص ١" /></label>
    <label>اللوحة<input name="plate" maxLength={20} dir="auto" /></label>
    <label>السعة<input name="capacity" type="number" min={1} max={80} defaultValue={14} /></label>
    <label>السائق<select name="driver_staff_id" defaultValue=""><option value="">بدون</option>{staff.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <button type="submit" className="btn-primary" disabled={pending}>إضافة</button>
  </form>;
}
export function RouteForm({ organizationId, vehicles, staff }: { organizationId: string; vehicles: Option[]; staff: Option[] }) {
  const [state, action, pending] = useActionState(saveRoute, {});
  const [key, setKey] = useState(0);
  useToast(state, () => setKey(value => value + 1));
  return <form key={key} action={action} className="composer">
    <input type="hidden" name="organization_id" value={organizationId} />
    <label>اسم المسار<input name="name" required maxLength={60} placeholder="مسار شمال الرياض" /></label>
    <label>الباص<select name="vehicle_id" defaultValue=""><option value="">بدون</option>{vehicles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>المشرفة<select name="supervisor_staff_id" defaultValue=""><option value="">بدون</option>{staff.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>ملاحظات<input name="notes" maxLength={500} /></label>
    <button type="submit" className="btn-primary" disabled={pending}>إضافة مسار</button>
  </form>;
}
export function StopForm({ organizationId, routeId, students }: { organizationId: string; routeId: string; students: Option[] }) {
  const [state, action, pending] = useActionState(saveStop, {});
  const [key, setKey] = useState(0);
  useToast(state, () => setKey(value => value + 1));
  return <form key={key} action={action} className="composer">
    <input type="hidden" name="organization_id" value={organizationId} /><input type="hidden" name="route_id" value={routeId} />
    <label>الطالب<select name="child_id" required defaultValue=""><option value="" disabled>اختر</option>{students.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>المحطة<input name="stop_name" maxLength={120} placeholder="الحي، أقرب معلم" /></label>
    <label>الترتيب<input name="stop_order" type="number" min={0} max={500} defaultValue={1} /></label>
    <label>وقت الركوب<input name="pickup_time" type="time" /></label>
    <label>وقت النزول<input name="dropoff_time" type="time" /></label>
    <button type="submit" className="btn" disabled={pending}>إضافة للمسار</button>
  </form>;
}
export function RemoveStop({ organizationId, id }: { organizationId: string; id: string }) {
  const { pending, run } = useRun();
  return <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={() => { if (window.confirm("إزالة الطالب من المسار؟")) run(() => removeStop(organizationId, id)); }}>إزالة</button>;
}
export function StartTrip({ organizationId, routeId, direction }: { organizationId: string; routeId: string; direction: Direction }) {
  const { pending, run } = useRun();
  return <button type="button" className="checkin" disabled={pending} onClick={() => run(() => startTrip(organizationId, routeId, direction))}><strong>بدء {directionLabels[direction]}</strong><span>اضغط عند تحرك الباص</span></button>;
}
export function FinishTrip({ organizationId, tripId, waiting }: { organizationId: string; tripId: string; waiting: number }) {
  const { pending, run } = useRun();
  return <button type="button" className="btn" disabled={pending} onClick={() => { if (!waiting || window.confirm(`فيه ${waiting} طالب ما تسجّل. إنهاء الرحلة؟`)) run(() => finishTrip(organizationId, tripId)); }}>إنهاء الرحلة</button>;
}
/** One rider on a running trip: big tap targets for the driver or supervisor, plus a WhatsApp note to the parent. */
export function RiderRow({ organizationId, tripId, child, stop, events, direction, route, phone, finished }: {
  organizationId: string; tripId: string; child: Option; stop: string | null; events: TripEvent[]; direction: Direction; route: string; phone: string | null; finished: boolean;
}) {
  const { pending, run } = useRun();
  const state = riderState(events);
  const next: TripEvent | null = state === "waiting" ? "boarded" : state === "on_bus" ? "dropped" : null;
  const last = events.includes("absent") ? "absent" : events.includes("dropped") ? "dropped" : events.includes("boarded") ? "boarded" : null;
  return <li className={`rider r-${state}`}>
    <span className="rider-info"><strong>{child.name}</strong><small>{stop ?? ""} · {riderLabels[state]}</small></span>
    <span className="rider-actions">
      {!finished && next ? <button type="button" className="rider-go" disabled={pending} onClick={() => run(() => recordRider(organizationId, tripId, child.id, next), true)}>{next === "boarded" ? "صعد ✓" : "نزل ✓"}</button> : null}
      {!finished && state === "waiting" ? <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => recordRider(organizationId, tripId, child.id, "absent"), true)}>ما ركب</button> : null}
      {last ? <a className="btn btn-sm share-wa" href={whatsappLink(phone, busMessage(child.name, last, direction, route))} target="_blank" rel="noopener noreferrer">إبلاغ الأهل</a> : null}
    </span>
  </li>;
}
