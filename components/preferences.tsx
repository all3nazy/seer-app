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
function useTheme() {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    setTheme(currentTheme());
    const sync = () => setTheme(currentTheme());
    window.addEventListener("seer-theme", sync);
    return () => window.removeEventListener("seer-theme", sync);
  }, []);
  function toggle() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("seer-theme", next); } catch { /* storage may be blocked */ }
    window.dispatchEvent(new Event("seer-theme"));
    play("tap");
  }
  return [theme, toggle] as const;
}
function useSound() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(soundEnabled());
    const sync = (event: Event) => setOn(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener("seer-sound", sync);
    return () => window.removeEventListener("seer-sound", sync);
  }, []);
  function toggle() { setSoundEnabled(!on); if (!on) play("message"); }
  return [on, toggle] as const;
}
export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const dark = theme === "dark";
  return <button type="button" className="icon-btn" onClick={toggle} aria-label={dark ? "التبديل إلى الوضع الفاتح" : "التبديل إلى الوضع الداكن"} title={dark ? "الوضع الفاتح" : "الوضع الداكن"}><Icon name={dark ? "sun" : "moon"} /></button>;
}
export function SoundToggle() {
  const [on, toggle] = useSound();
  return <button type="button" className="icon-btn" onClick={toggle} aria-pressed={on} aria-label={on ? "كتم أصوات الواجهة" : "تشغيل أصوات الواجهة"} title={on ? "الأصوات تعمل" : "الأصوات مكتومة"}><Icon name={on ? "sound" : "mute"} /></button>;
}
/** Settings rows with an on/off switch, like the reference design's toggles. */
export function ThemeSwitchRow() {
  const [theme, toggle] = useTheme();
  return <div className="group-row"><span className="tile-icon tone-plum"><Icon name="moon" /></span><span className="grow" id="theme-label">الوضع الداكن</span>
    <button type="button" className="switch" role="switch" aria-checked={theme === "dark"} aria-labelledby="theme-label" onClick={toggle} /></div>;
}
export function SoundSwitchRow() {
  const [on, toggle] = useSound();
  return <div className="group-row"><span className="tile-icon tone-sky"><Icon name="sound" /></span><span className="grow" id="sound-label">أصوات الواجهة</span>
    <button type="button" className="switch" role="switch" aria-checked={on} aria-labelledby="sound-label" onClick={toggle} /></div>;
}
