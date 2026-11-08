"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase";

/** Refreshes the page when attendance or pickups change in the organization, and shows a live badge. */
export function LiveRefresh({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const [, startTransition] = useTransition();
  useEffect(() => {
    let timer: number | undefined;
    const refresh = () => { window.clearTimeout(timer); timer = window.setTimeout(() => startTransition(() => router.refresh()), 600); };
    let channel: ReturnType<ReturnType<typeof getSupabaseBrowserClient>["channel"]> | null = null;
    let connected = false;
    try {
      const filter = `organization_id=eq.${organizationId}`;
      channel = getSupabaseBrowserClient().channel(`classes-${organizationId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "attendance", filter }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "pickups", filter }, refresh)
        .subscribe((status: string) => { connected = status === "SUBSCRIBED"; setLive(connected); });
    } catch { /* falls back to the interval below */ }
    const poll = window.setInterval(() => { if (!connected && document.visibilityState === "visible") startTransition(() => router.refresh()); }, 60_000);
    return () => { window.clearInterval(poll); window.clearTimeout(timer); if (channel) void getSupabaseBrowserClient().removeChannel(channel); };
  }, [organizationId, router]);
  return <span className="live-status" style={{ boxShadow: "none" }}><span className={`live-dot ${live ? "live" : "connecting"}`} aria-hidden="true" />{live ? "مباشر" : "يتحدّث تلقائيًا"}</span>;
}
