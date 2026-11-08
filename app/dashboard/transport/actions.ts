"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { uuid, ValidationError } from "../../../lib/operations";
import { riyadhToday } from "../../../lib/students";
import { directions, tripEvents } from "../../../lib/transport";

export type BusResult = { error?: string; success?: string };
const s = (data: FormData, key: string) => { const v = data.get(key); return typeof v === "string" ? v.trim() : ""; };
const refresh = () => revalidatePath("/dashboard/transport");
const fail = (error: unknown, fallback: string): BusResult => ({ error: error instanceof ValidationError ? error.message : fallback });

export async function saveVehicle(_: BusResult, data: FormData): Promise<BusResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const name = s(data, "name");
    if (!name || name.length > 60) return { error: "اكتب اسم الباص." };
    const capacity = Number(s(data, "capacity") || 14);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 80) return { error: "السعة من ١ إلى ٨٠." };
    const driver = s(data, "driver_staff_id");
    const db = await createSupabaseServerClient();
    const { error } = await db.from("vehicles").insert({ organization_id: org, name, plate: s(data, "plate").slice(0, 20) || null, capacity, driver_staff_id: driver ? uuid(driver) : null });
    if (error) return { error: "إضافة الباصات لمالك المنشأة أو مديرها." };
    refresh();
    return { success: "أُضيف الباص." };
  } catch (error) { return fail(error, "تعذر الإضافة."); }
}
export async function saveRoute(_: BusResult, data: FormData): Promise<BusResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const name = s(data, "name");
    if (!name || name.length > 60) return { error: "اكتب اسم المسار." };
    const vehicle = s(data, "vehicle_id"), supervisor = s(data, "supervisor_staff_id");
    const db = await createSupabaseServerClient();
    const { error } = await db.from("bus_routes").insert({ organization_id: org, name, vehicle_id: vehicle ? uuid(vehicle) : null, supervisor_staff_id: supervisor ? uuid(supervisor) : null, notes: s(data, "notes").slice(0, 500) || null });
    if (error?.code === "23505") return { error: "اسم المسار مستخدم." };
    if (error) return { error: "إضافة المسارات لمالك المنشأة أو مديرها." };
    refresh();
    return { success: "أُضيف المسار. أضف الطلاب ومحطاتهم." };
  } catch (error) { return fail(error, "تعذر الإضافة."); }
}
/** Adds a student to a route (or moves them from another route). */
export async function saveStop(_: BusResult, data: FormData): Promise<BusResult> {
  try {
    const org = uuid(data.get("organization_id")), route = uuid(data.get("route_id")), child = uuid(data.get("child_id"));
    const time = (key: string) => { const v = s(data, key); if (v && !/^\d{2}:\d{2}$/.test(v)) throw new ValidationError("وقت غير صحيح."); return v || null; };
    const values = { route_id: route, stop_name: s(data, "stop_name").slice(0, 120) || null, stop_order: Math.max(0, Math.min(500, Number(s(data, "stop_order") || 0))), pickup_time: time("pickup_time"), dropoff_time: time("dropoff_time") };
    const db = await createSupabaseServerClient();
    const { data: existing } = await db.from("route_stops").select("id").eq("organization_id", org).eq("child_id", child).maybeSingle();
    const { error } = existing
      ? await db.from("route_stops").update(values).eq("id", existing.id as string)
      : await db.from("route_stops").insert({ ...values, organization_id: org, child_id: child });
    if (error) return { error: "تعديل المسارات لمالك المنشأة أو مديرها." };
    refresh();
    return { success: existing ? "انتقل الطالب لهذا المسار." : "أُضيف الطالب للمسار." };
  } catch (error) { return fail(error, "تعذر الحفظ."); }
}
export async function removeStop(organizationId: string, id: string): Promise<BusResult> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("route_stops").delete().eq("organization_id", organizationId).eq("id", id).select("id");
  if (error || !data?.length) return { error: "الحذف لمالك المنشأة أو مديرها." };
  refresh();
  return { success: "أُزيل الطالب من المسار." };
}
export async function startTrip(organizationId: string, routeId: string, direction: string): Promise<BusResult> {
  try {
    if (!directions.includes(direction as (typeof directions)[number])) return { error: "اختر الاتجاه." };
    const db = await createSupabaseServerClient();
    const { error } = await db.from("transport_trips").insert({ organization_id: uuid(organizationId), route_id: uuid(routeId), trip_date: riyadhToday(), direction });
    if (error?.code === "23505") return { error: "الرحلة بدأت من قبل." };
    if (error) return { error: "تعذر بدء الرحلة." };
    refresh();
    return { success: "بدأت الرحلة. سجّل صعود ونزول الطلاب." };
  } catch { return { error: "تعذر بدء الرحلة." }; }
}
export async function finishTrip(organizationId: string, tripId: string): Promise<BusResult> {
  const db = await createSupabaseServerClient();
  const { error } = await db.from("transport_trips").update({ finished_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("id", tripId);
  if (error) return { error: "الرحلة منتهية من قبل." };
  refresh();
  return { success: "انتهت الرحلة." };
}
export async function recordRider(organizationId: string, tripId: string, childId: string, event: string): Promise<BusResult> {
  try {
    if (!tripEvents.includes(event as (typeof tripEvents)[number])) return { error: "حدث غير صالح." };
    const db = await createSupabaseServerClient();
    const { error } = await db.from("trip_events").insert({ organization_id: uuid(organizationId), trip_id: uuid(tripId), child_id: uuid(childId), event });
    if (error?.code === "23505") return { error: "مسجّل من قبل." };
    if (error?.code === "23514") return { error: "الرحلة منتهية أو الطالب مو على هذا المسار." };
    if (error) return { error: "تعذر التسجيل." };
    refresh();
    return { success: "تم." };
  } catch { return { error: "تعذر التسجيل." }; }
}
