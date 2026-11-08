"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { iconCookie, iconDesignLabels, iconDesigns, iconFiles, iconToneLabels, iconTones, parseIconChoice, type IconChoice } from "../lib/app-icons";
import { notify } from "./feedback";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };

/** Registers the service worker and keeps the browser's install prompt for the Settings button. */
export function InstallRegistrar() {
  useEffect(() => {
    const keep = (event: Event) => { event.preventDefault(); deferred = event as InstallPrompt; emit(); };
    const done = () => { deferred = null; emit(); };
    window.addEventListener("beforeinstallprompt", keep);
    window.addEventListener("appinstalled", done);
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* the app still works without it */ });
    }
    return () => { window.removeEventListener("beforeinstallprompt", keep); window.removeEventListener("appinstalled", done); };
  }, []);
  return null;
}

type Platform = "installed" | "prompt" | "ios" | "mac-safari" | "other";
function detect(): Platform {
  if (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone) return "installed";
  if (deferred) return "prompt";
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  if (ios) return "ios";
  if (/Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)) return "mac-safari";
  return "other";
}

/** "Install Seer on this device", with the right steps for each platform. */
export function InstallCard() {
  const hasPrompt = useSyncExternalStore(subscribe, () => Boolean(deferred), () => false);
  const [platform, setPlatform] = useState<Platform | null>(null);
  useEffect(() => { setPlatform(detect()); }, [hasPrompt]);
  if (!platform) return null;
  if (platform === "installed") return <p className="chip-soft ok" style={{ display: "inline-block" }}>✓ سِير مثبّت على هذا الجهاز</p>;
  if (platform === "prompt") return <button type="button" className="btn btn-primary" onClick={async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null; emit();
    notify(outcome === "accepted" ? "تم التثبيت. تلاقي سِير في الشاشة الرئيسية أو قائمة التطبيقات." : "ما تم التثبيت. تقدر تثبّته متى ما حبيت.", "info", outcome === "accepted" ? "done" : undefined);
  }}>ثبّت سِير على هذا الجهاز</button>;
  const steps = platform === "ios"
    ? ["افتح سِير في متصفح سفاري.", "اضغط زر المشاركة (المربع والسهم ⬆︎).", "اختر «إضافة إلى الشاشة الرئيسية» ثم «إضافة»."]
    : platform === "mac-safari"
      ? ["من قائمة «ملف» في سفاري اختر «إضافة إلى Dock».", "يظهر سِير في الـDock ويفتح في نافذة خاصة."]
      : ["افتح قائمة المتصفح (⋮) في كروم أو إيدج.", "اختر «تثبيت سِير» أو «تثبيت التطبيق».", "يفتح سِير في نافذة خاصة وتلاقيه في قائمة البرامج."];
  return <ol className="install-steps">{steps.map(step => <li key={step}>{step}</li>)}</ol>;
}

function currentChoice(): IconChoice {
  const match = document.cookie.split("; ").find(part => part.startsWith(`${iconCookie}=`));
  return parseIconChoice(match?.split("=")[1]).choice;
}
/** Pick one of three designs in light or dark; the page icon updates at once. */
export function IconPicker({ initial }: { initial: IconChoice }) {
  const router = useRouter();
  const [choice, setChoice] = useState<IconChoice>(initial);
  useEffect(() => { setChoice(currentChoice()); }, []);
  const { design, tone } = parseIconChoice(choice);
  const pick = (next: IconChoice) => {
    document.cookie = `${iconCookie}=${next}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    setChoice(next);
    const files = iconFiles(next);
    document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]').forEach(link => { link.href = link.sizes?.value === "192x192" ? files.icon192 : files.favicon; });
    document.querySelectorAll<HTMLLinkElement>('link[rel="apple-touch-icon"]').forEach(link => { link.href = files.apple; });
    notify("تم اختيار الأيقونة.", "info", "done");
    router.refresh();
  };
  return <div className="icon-picker">
    <div className="segments" role="radiogroup" aria-label="درجة الأيقونة">
      {iconTones.map(item => <button key={item} type="button" role="radio" aria-checked={tone === item} className="pick" aria-pressed={tone === item} onClick={() => pick(`${design}-${item}`)}>{iconToneLabels[item]}</button>)}
    </div>
    <div className="icon-options" role="radiogroup" aria-label="شكل الأيقونة">
      {iconDesigns.map(item => <button key={item} type="button" role="radio" aria-checked={design === item} className={`icon-option${design === item ? " is-picked" : ""}`} onClick={() => pick(`${item}-${tone}`)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconFiles(`${item}-${tone}`).icon192} alt="" width={84} height={84} />
        <strong>{iconDesignLabels[item].name}</strong>
        <span>{iconDesignLabels[item].idea}</span>
      </button>)}
    </div>
  </div>;
}
