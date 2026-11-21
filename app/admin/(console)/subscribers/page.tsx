import { requestSession } from "../../../../lib/supabase/server";
import { SubscribersView, sortOptions, statusFilters, type SubscriberQuery, type SubscriberRow } from "../../../../components/admin-subscribers";
import type { SetupRow } from "../../../../lib/onboarding";

export const metadata = { title: "المنشآت" };
const uuid = /^[0-9a-f-]{36}$/;

/** المشتركين › المنشآت: search by name, city, owner email or phone; filters; sort; pages. */
export default async function AdminSubscribers({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const query: SubscriberQuery = {
    q: (params.q ?? "").trim().slice(0, 80),
    status: statusFilters.some(([key]) => key === params.status) ? params.status ?? "" : "",
    plan: uuid.test(params.plan ?? "") ? params.plan! : "",
    ending: params.ending === "1",
    sort: sortOptions.some(([key]) => key === params.sort) ? params.sort! : "ending",
    page: Math.max(1, Math.min(1000, Number.parseInt(params.page ?? "1", 10) || 1)),
  };
  const { client } = await requestSession();
  const [list, plans, setup] = await Promise.all([
    client.rpc("admin_subscribers_v2", { p_search: query.q || null, p_status: query.status || null, p_plan: query.plan || null, p_ending: query.ending, p_sort: query.sort, p_page: query.page }),
    client.from("plans").select("id,name").order("sort_order"),
    client.rpc("admin_onboarding"),
  ]);
  return <SubscribersView rows={(list.data ?? []) as SubscriberRow[]} plans={(plans.data ?? []) as { id: string; name: string }[]} query={query}
    setup={new Map(((setup.data ?? []) as SetupRow[]).map(row => [row.organization_id, row]))} />;
}
