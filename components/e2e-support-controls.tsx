"use client";
import { supportNotification, viewingSupportThread } from "./support-badge";

/** Browser-test controls (the /e2e/shell page only): simulate a live support notification or opening a thread. */
export function E2ESupportControls() {
  const id = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    <button type="button" className="btn" onClick={() => supportNotification({ kind: "support", url: `/dashboard/support/${id(9)}` })}>وصل رد</button>
    <button type="button" className="btn" onClick={() => supportNotification({ kind: "support", url: `/admin/support/${id(8)}` })}>وصلت تذكرة</button>
    <button type="button" className="btn" onClick={() => viewingSupportThread(id(1))}>فتح التذكرة ١</button>
    <button type="button" className="btn" onClick={() => viewingSupportThread(id(9))}>فتح التذكرة ٩</button>
  </div>;
}
