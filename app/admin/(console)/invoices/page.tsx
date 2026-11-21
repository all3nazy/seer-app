import { requestSession } from "../../../../lib/supabase/server";
import { currentAdminRole, mayOpen } from "../../../../lib/admin-role";
import { AdminNoAccess } from "../../../../components/admin-no-access";
import { InvoicesView, type InvoiceRow } from "../../../../components/admin-stage3-views";

export const metadata = { title: "الفواتير والإيصالات" };

export default async function AdminInvoices({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; page?: string }> }) {
  if (!(await mayOpen("/admin/invoices"))) return <AdminNoAccess role={await currentAdminRole()} />;
  const params = await searchParams;
  const query = { q: (params.q ?? "").trim().slice(0, 80), kind: params.kind === "receipt" || params.kind === "adjustment" ? params.kind : "" };
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const { client } = await requestSession();
  const { data } = await client.rpc("admin_invoices", { p_search: query.q || null, p_kind: query.kind || null, p_page: page });
  return <InvoicesView rows={(data ?? []) as InvoiceRow[]} query={query} page={page} />;
}
