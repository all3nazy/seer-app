"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { Icon } from "./icons";
import { notify } from "./feedback";

// Both bells receive the same notification; show its pop-up once.
const announced = new Set<string>();
type Item = { id: string; kind: string; title: string; body: string | null; url: string | null; read_at: string | null; created_at: string };
const ago = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `قبل ${minutes.toLocaleString("ar-SA")} د`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `قبل ${hours.toLocaleString("ar-SA")} س` : new Date(iso).toLocaleDateString("ar-SA", { day: "numeric", month: "short" });
};

/** The bell: the person's latest notifications, live, with an unread count. */
export function NotificationBell({ userId }: { userId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // The bell appears twice (sidebar and phone top bar); each needs its own realtime channel name,
  // otherwise the second one reuses a channel that is already subscribed and fails.
  const instance = useId().replace(/[^a-zA-Z0-9]/g, "");
  const load = useCallback(async () => {
    const { data } = await getSupabaseBrowserClient().from("notifications").select("id,kind,title,body,url,read_at,created_at").order("created_at", { ascending: false }).limit(20);
    setItems((data ?? []) as Item[]);
  }, []);
  useEffect(() => {
    void load();
    const client = getSupabaseBrowserClient();
    const channel = client.channel(`notifications-${userId}-${instance}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload: { new: unknown }) => {
        const item = payload.new as Item;
        setItems(current => [item, ...current.filter(row => row.id !== item.id)].slice(0, 20));
        if (!announced.has(item.id)) { announced.add(item.id); notify(item.title, "info"); }
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [userId, load, instance]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const unread = items.filter(item => !item.read_at).length;
  const markAll = async () => {
    const ids = items.filter(item => !item.read_at).map(item => item.id);
    if (!ids.length) return;
    setItems(current => current.map(item => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
    await getSupabaseBrowserClient().from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
  };
  const markOne = (id: string) => {
    setItems(current => current.map(item => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
    void getSupabaseBrowserClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  };
  return <div className="bell" ref={box}>
    <button type="button" className="bell-button" aria-expanded={open} aria-label={unread ? `الإشعارات: ${unread} جديدة` : "الإشعارات"} onClick={() => setOpen(value => !value)}>
      <Icon name="bell" />{unread ? <span className="bell-count" aria-hidden="true">{unread > 9 ? "9+" : unread.toLocaleString("ar-SA")}</span> : null}
    </button>
    {open ? <div className="bell-panel" role="dialog" aria-label="الإشعارات">
      <div className="bell-head"><strong>الإشعارات</strong>{unread ? <button type="button" className="btn btn-sm" onClick={() => void markAll()}>تعليم الكل كمقروء</button> : null}</div>
      {items.length ? <ul>{items.map(item => <li key={item.id} className={item.read_at ? "" : "unread"}>
        <Link href={item.url ?? "/dashboard"} onClick={() => { markOne(item.id); setOpen(false); }}>
          <strong>{item.title}</strong>{item.body ? <span>{item.body}</span> : null}<small>{ago(item.created_at)}</small>
        </Link>
      </li>)}</ul> : <p className="hint" style={{ padding: "8px 4px" }}>ما فيه إشعارات بعد. يوصلك هنا كل ما يخصك: المهام، والردود، والإجازات.</p>}
      <Link className="bell-foot" href="/dashboard/settings#notify" onClick={() => setOpen(false)}>إشعارات الجوال والكمبيوتر</Link>
    </div> : null}
  </div>;
}

const urlBase64ToUint8Array = (value: string) => {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
};
/** Turn push notifications on or off for this device. */
export function PushToggle() {
  const [key, setKey] = useState("");
  const [state, setState] = useState<"unsupported" | "denied" | "on" | "off" | "loading">("loading");
  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setState("unsupported"); return; }
      const { data } = await getSupabaseBrowserClient().rpc("push_public_key");
      if (typeof data !== "string" || !data) { setState("unsupported"); return; }
      setKey(data);
      if (Notification.permission === "denied") { setState("denied"); return; }
      const registration = await navigator.serviceWorker.ready;
      setState((await registration.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);
  const turnOn = async () => {
    setState("loading");
    try {
      if ((await Notification.requestPermission()) !== "granted") { setState("denied"); return; }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const { error } = await getSupabaseBrowserClient().from("push_subscriptions").upsert({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }, { onConflict: "endpoint", ignoreDuplicates: true });
      if (error) throw error;
      setState("on");
      notify("تفعّلت الإشعارات على هذا الجهاز.", "info", "done");
    } catch { setState("off"); notify("تعذر تفعيل الإشعارات على هذا الجهاز.", "error"); }
  };
  const turnOff = async () => {
    setState("loading");
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) { await getSupabaseBrowserClient().from("push_subscriptions").delete().eq("endpoint", subscription.endpoint); await subscription.unsubscribe(); }
    setState("off");
    notify("أُوقفت الإشعارات على هذا الجهاز.", "info");
  };
  if (state === "loading") return <p className="hint">جارٍ التحقق…</p>;
  if (state === "unsupported") return <p className="hint">هذا المتصفح ما يدعم الإشعارات. على الآيفون والآيباد: ثبّت سِير على الشاشة الرئيسية أولًا (iOS 16.4 أو أحدث)، ثم افتحه من الأيقونة وفعّلها من هنا.</p>;
  if (state === "denied") return <p className="hint">الإشعارات محظورة لهذا الموقع. فعّلها من إعدادات المتصفح أو الجهاز، ثم ارجع هنا.</p>;
  return state === "on"
    ? <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><span className="chip-soft ok">✓ الإشعارات مفعّلة على هذا الجهاز</span><button type="button" className="btn btn-sm" onClick={() => void turnOff()}>إيقاف</button></div>
    : <button type="button" className="btn btn-primary" onClick={() => void turnOn()}>تفعيل الإشعارات على هذا الجهاز</button>;
}
