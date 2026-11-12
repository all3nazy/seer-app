import Link from "next/link";
import { Icon } from "./icons";

/** «الدعم» as the first row of the phone «المزيد» page, with the count of tickets to look at. */
export function SupportMenuRow({ admin, count }: { admin: boolean; count: number }) {
  return <Link className="group-row support-link" href={admin ? "/admin/support" : "/dashboard/support"}>
    <span className="tile-icon tone-sun"><Icon name="help" /></span><span className="grow">الدعم{admin ? " (المشتركين)" : ""}</span>
    {count ? <span className="nav-badge" aria-label={admin ? `${count} بانتظار ردّك` : `${count} فيها رد جديد`}>{count > 9 ? "9+" : count.toLocaleString("ar-SA")}</span> : null}<Icon name="arrowNext" />
  </Link>;
}
