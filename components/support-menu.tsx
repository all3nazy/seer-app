"use client";
import Link from "next/link";
import { Icon } from "./icons";
import { useSupportBadge } from "./support-badge";
import { arNumber } from "../lib/dates";

/** «الدعم» as the first row of the phone «المزيد» page, with the live count of threads to look at. */
export function SupportMenuRow() {
  const count = useSupportBadge().mine;
  return <Link className="group-row support-link" href="/dashboard/support">
    <span className="tile-icon tone-sun"><Icon name="help" /></span><span className="grow">الدعم</span>
    {count ? <span className="nav-badge" aria-label={`${count} فيها رد جديد`}>{count > 9 ? "9+" : arNumber(count)}</span> : null}<Icon name="arrowNext" />
  </Link>;
}
