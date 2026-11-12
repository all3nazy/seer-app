"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase";

/**
 * Keeps the support list current: a new ticket or reply (realtime, platform admins see every
 * thread) refreshes the list once, at most every 1.5 seconds. The list stays visible meanwhile.
 */
export function AdminSupportLive() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  useEffect(() => {
    let timer: number | undefined;
    const refresh = () => { window.clearTimeout(timer); timer = window.setTimeout(() => startTransition(() => router.refresh()), 1500); };
    const client = getSupabaseBrowserClient();
    const channel = client.channel(`admin-support-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_threads" }, refresh)
      .subscribe();
    return () => { window.clearTimeout(timer); void client.removeChannel(channel); };
  }, [router]);
  return null;
}
