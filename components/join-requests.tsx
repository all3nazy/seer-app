"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { orgTypeLabels } from "../lib/org-invites";
import { confirmAction } from "./confirm";
import { notify } from "./feedback";
import { FreshLink } from "./org-invites";

export type JoinRow = { id: string; org_name: string; org_type: string; city: string; contact_name: string; phone: string; students: number | null; status: string; created_at: string; invite_status: string | null };
const statusLabels: Record<string, string> = { new: "جديد", invited: "أُرسلت دعوة", rejected: "مرفوض" };
const date = (iso: string) => new Date(iso).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh", day: "numeric", month: "short" });

/** Requests from the home page: «أرسل دعوة» (3 free months, link shown once) or «رفض». */
export function JoinRequests({ requests }: { requests: JoinRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [fresh, setFresh] = useState<{ token: string; orgName: string; phone: string } | null>(null);
  const refresh = () => startTransition(() => router.refresh());
  async function decide(row: JoinRow, decision: "invite" | "reject") {
    if (!(await confirmAction(decision === "invite" ? `إنشاء دعوة لـ«${row.org_name}» بتجربة ٣ أشهر؟` : `رفض طلب «${row.org_name}»؟`))) return;
    const { data, error } = await getSupabaseBrowserClient().rpc("admin_decide_join_request", { request: row.id, decision });
    if (error) { notify(error.code === "42501" ? "لمسؤول المنصة فقط." : "تعذر التنفيذ؛ ربما تم التعامل مع الطلب.", "error"); refresh(); return; }
    const result = data as { token?: string };
    if (decision === "invite" && result.token) setFresh({ token: result.token, orgName: row.org_name, phone: row.phone });
    else notify("رُفض الطلب.", "info", "done");
    refresh();
  }
  const waiting = requests.filter(row => row.status === "new").length;
  return <section className="card" aria-labelledby="join-requests-title" style={{ marginBottom: 16 }}>
    <h2 id="join-requests-title" style={{ margin: 0, fontSize: 18 }}>طلبات الانضمام{waiting ? <span className="chip-soft coral" style={{ marginInlineStart: 8 }}>{waiting.toLocaleString("ar-SA")} جديد</span> : null}</h2>
    {fresh ? <FreshLink token={fresh.token} orgName={fresh.orgName} months={3} phone={fresh.phone} onDone={() => setFresh(null)} /> : null}
    {requests.length ? <ul className="records" style={{ marginTop: 12 }}>{requests.map(row => <li key={row.id} className="invite-row">
      <span><strong>{row.org_name}</strong> <span className="hint">{orgTypeLabels[row.org_type] ?? row.org_type} · {row.city}{row.students ? ` · ${row.students.toLocaleString("ar-SA")} طالب تقريبًا` : ""}</span>
        <span className="hint" style={{ display: "block" }}>{row.contact_name} · <span dir="ltr">{row.phone}</span> · {date(row.created_at)}{row.invite_status === "used" ? " · تفعّلت ✓" : ""}</span></span>
      <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className={`chip-soft ${row.status === "new" ? "coral" : row.status === "invited" ? "ok" : ""}`}>{statusLabels[row.status] ?? row.status}</span>
        {row.status === "new" ? <><button type="button" className="btn btn-sm btn-primary" onClick={() => void decide(row, "invite")}>أرسل دعوة</button>
          <button type="button" className="btn btn-sm btn-danger" onClick={() => void decide(row, "reject")}>رفض</button></> : null}
      </span>
    </li>)}</ul> : <p className="empty" style={{ marginTop: 12 }}>ما فيه طلبات انضمام بعد.</p>}
  </section>;
}
