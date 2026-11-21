import { requestSession } from "../../../../lib/supabase/server";
import { currentAdminRole, mayOpen } from "../../../../lib/admin-role";
import { AdminNoAccess } from "../../../../components/admin-no-access";
import { CouponsView, type CouponUse } from "../../../../components/admin-stage3-views";
import type { Coupon } from "../../../../lib/admin-stage3";

export const metadata = { title: "الكوبونات والعروض" };
const uuid = /^[0-9a-f-]{36}$/;

/** «الكوبونات والعروض»: create, edit, disable; the payments that used each one (finance and owners). */
export default async function AdminCoupons({ searchParams }: { searchParams: Promise<{ coupon?: string }> }) {
  if (!(await mayOpen("/admin/coupons"))) return <AdminNoAccess role={await currentAdminRole()} />;
  const selected = (await searchParams).coupon;
  const { client } = await requestSession();
  const [coupons, plans, uses] = await Promise.all([
    client.rpc("admin_coupons"),
    client.from("plans").select("id,name").order("sort_order"),
    selected && uuid.test(selected) ? client.rpc("admin_coupon_uses", { p_coupon: selected }) : Promise.resolve({ data: [] }),
  ]);
  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  return <CouponsView coupons={(coupons.data ?? []) as Coupon[]} plans={(plans.data ?? []) as { id: string; name: string }[]} today={today} selected={selected} uses={(uses.data ?? []) as CouponUse[]} />;
}
