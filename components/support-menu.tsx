"use client";
import Link from "next/link";
import { Icon } from "./icons";
import { useSupportBadge } from "./support-badge";
import { arNumber } from "../lib/dates";

/** «الدعم» as the first row of the phone «المزيد» page, with the live count of threads to look at. */
export function SupportMenuRow({ admin }: { admin: boolean }) {
  const badge = useSupportBadge();
  const count = admin ? badge.team ?? 0 : badge.mine;
  return <Link className="group-row support-link" href={admin ? "/admin/support" : "/dashboard/support"}>
    <span className="tile-icon tone-sun"><Icon name="help" /></span><span className="grow">الدعم{admin ? " (المشتركين)" : ""}</span>
    {count ? <span className="nav-badge" aria-label={admin ? `${count} بانتظار ردّك` : `${count} فيها رد جديد`}>{count > 9 ? "9+" : arNumber(count)}</span> : null}<Icon name="arrowNext" />
  </Link>;
}
