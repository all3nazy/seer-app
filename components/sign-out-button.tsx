"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { Icon } from "./icons";
import { notify } from "./feedback";

/** `to`: where to go after signing out (each side has its own sign-in page). */
export default function SignOutButton({ compact = false, to = "/login" }: { compact?: boolean; to?: "/login" | "/admin/login" }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function signOut() {
    setBusy(true);
    try {
      const { error } = await getSupabaseBrowserClient().auth.signOut();
      if (error) throw error;
      router.replace(to);
      router.refresh();
    } catch {
      setBusy(false);
      notify("تعذر تسجيل الخروج. حاول مرة أخرى.", "error");
    }
  }
  if (compact) return <button type="button" className="icon-btn" disabled={busy} onClick={signOut} aria-label="تسجيل الخروج" title="تسجيل الخروج"><Icon name="logout" /></button>;
  return <button type="button" className="btn btn-sm" disabled={busy} onClick={signOut}><Icon name="logout" />{busy ? "جارٍ الخروج…" : "تسجيل الخروج"}</button>;
}
