"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AssistantPanel } from "./assistant-panel";
import { BotAvatar } from "./bot-avatar";
import { botPersonas, type Stage } from "../lib/stage";

/**
 * The assistant as a floating companion: a launcher on every page that opens a side drawer.
 * Its face and greeting follow the organization's stage (nursery, kindergarten or school).
 */
export function BotDock({ stage, organizations, disabled = [] }: { stage: Stage; organizations: { id: string; name: string }[]; disabled?: string[] }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const persona = botPersonas[stage];
  const drawer = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); }, [path]);
  // The phone top bar opens the assistant with an event, so no floating button covers the page.
  useEffect(() => {
    const openBot = () => setOpen(true);
    // Starting the guide from the assistant closes it so the page and its highlight show.
    const closeBot = () => setOpen(false);
    window.addEventListener("seer:open-bot", openBot);
    window.addEventListener("seer:close-bot", closeBot);
    return () => { window.removeEventListener("seer:open-bot", openBot); window.removeEventListener("seer:close-bot", closeBot); };
  }, []);
  useEffect(() => {
    if (!open) return;
    drawer.current?.querySelector<HTMLElement>("input,textarea,button")?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); launcher.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (path === "/dashboard/assistant") return null;
  return <>
    <button ref={launcher} type="button" className={`bot-launcher${open ? " is-open" : ""}`} onClick={() => setOpen(value => !value)}
      aria-expanded={open} aria-controls="bot-drawer" aria-label={open ? `إغلاق ${persona.name}` : `افتح ${persona.name}، ${persona.title}`}>
      <BotAvatar stage={stage} size={44} mood={open ? "happy" : "idle"} />
    </button>
    <div className={`bot-scrim${open ? " is-open" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />
    <aside id="bot-drawer" ref={drawer} className={`bot-drawer${open ? " is-open" : ""}`} aria-label={persona.title} aria-hidden={!open} inert={!open}>
      <header className="bot-drawer-head">
        <BotAvatar stage={stage} size={52} mood="happy" />
        <div style={{ flex: 1, minWidth: 0 }}><strong>{persona.name}</strong><span>{persona.title}</span></div>
        <button type="button" className="icon-btn" onClick={() => { setOpen(false); launcher.current?.focus(); }} aria-label="إغلاق">✕</button>
      </header>
      <p className="bot-hint">{persona.greeting} {persona.hint}</p>
      <div className="bot-drawer-body">
        {organizations.length ? <AssistantPanel organizations={organizations} stage={stage} disabled={disabled} /> : <p className="hint">اطلب من مسؤول المنصة ربط حسابك بمنشأة.</p>}
      </div>
    </aside>
  </>;
}
