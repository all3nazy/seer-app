import { requestSession } from "../../../../lib/supabase/server";
import { JoinRequests, type JoinRow } from "../../../../components/join-requests";
import { appBase } from "../../../../lib/surface";

export const metadata = { title: "طلبات الانضمام" };

/** المشتركين › طلبات الانضمام: requests from the public page, moved here from the subscribers page. */
export default async function AdminJoinRequests() {
  const { client } = await requestSession();
  const { data } = await client.rpc("admin_join_requests");
  return <>
    <header className="page-head"><div><h1>طلبات الانضمام</h1><p>الطلبات اللي توصل من صفحة سِير العامة.</p></div></header>
    <JoinRequests requests={(data ?? []) as JoinRow[]} appUrl={appBase()} />
  </>;
}
