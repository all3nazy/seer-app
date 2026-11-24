"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { notify } from "./feedback";

/** «أرشفة» / «إرجاع للوارد» and «تعليم كغير مقروء» for one inbox message. */
export function InboxActions({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  async function mark(action: "archive" | "unarchive" | "unread") {
    const { error } = await getSupabaseBrowserClient().rpc("admin_inbox_mark", { message: id, action });
    if (error) { notify(error.code === "42501" ? "هذا خارج صلاحية دورك." : "تعذر التنفيذ. حاول مرة ثانية.", "error"); return; }
    notify(action === "archive" ? "انتقلت للمؤرشف." : action === "unarchive" ? "رجعت للوارد." : "تعلّمت كغير مقروءة.", "info", "done");
    start(() => router.push("/admin/inbox"));
  }
  return <>
    <button type="button" className="btn" disabled={pending} onClick={() => void mark(archived ? "unarchive" : "archive")}>{archived ? "إرجاع للوارد" : "أرشفة"}</button>
    {archived ? null : <button type="button" className="btn" disabled={pending} onClick={() => void mark("unread")}>تعليم كغير مقروءة</button>}
  </>;
}
