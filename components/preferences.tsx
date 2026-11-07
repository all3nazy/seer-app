"use client";
import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { play, setSoundEnabled, soundEnabled } from "../lib/sound";

type Theme = "light" | "dark";
function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => setTheme(currentTheme()), []);
  function toggle() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("seer-theme", next); } catch { /* storage may be blocked */ }
    setTheme(next);
    play("tap");
  }
  const dark = theme === "dark";
  return <button type="button" className="icon-btn" onClick={toggle} aria-label={dark ? "التبديل إلى الوضع الفاتح" : "التبديل إلى الوضع الداكن"} title={dark ? "الوضع الفاتح" : "الوضع الداكن"}>
    <Icon name={dark ? "sun" : "moon"} />
  </button>;
}
export function SoundToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(soundEnabled());
    const sync = (event: Event) => setOn(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener("seer-sound", sync);
    return () => window.removeEventListener("seer-sound", sync);
  }, []);
  function toggle() { setSoundEnabled(!on); setOn(!on); if (!on) play("message"); }
  return <button type="button" className="icon-btn" onClick={toggle} aria-pressed={on} aria-label={on ? "كتم أصوات الواجهة" : "تشغيل أصوات الواجهة"} title={on ? "الأصوات تعمل" : "الأصوات مكتومة"}>
    <Icon name={on ? "sound" : "mute"} />
  </button>;
}
