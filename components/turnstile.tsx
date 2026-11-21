"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile for the sign-in, sign-up and activation forms. Dormant until
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is set: no script is loaded and the token is always null, so the
 * forms work as before. Once set, the widget is invisible for normal people ("interaction-only"),
 * in Arabic, and follows the app's light/dark theme. A token is used once: call reset() after each
 * attempt. An expired or failed check refreshes by itself and shows a short message meanwhile.
 */
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
type Widget = { render: (element: HTMLElement, options: Record<string, unknown>) => string; reset: (id: string) => void; remove: (id: string) => void };
declare global { interface Window { turnstile?: Widget } }

let loading: Promise<Widget> | null = null;
function loadTurnstile(): Promise<Widget> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<Widget>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile"));
    script.onerror = () => { loading = null; reject(new Error("turnstile")); };
    document.head.appendChild(script);
  });
  return loading;
}

export const turnstileSiteKey = () => process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";
const theme = () => document.documentElement.dataset.theme === "dark" ? "dark" : document.documentElement.dataset.theme === "light" ? "light" : "auto";

export type TurnstileHandle = {
  /** Whether Turnstile is configured at all. */
  enabled: boolean;
  /** The widget's place in the form (nothing when not configured). */
  widget: React.ReactNode;
  /** A fresh token, waiting up to 15 seconds for the check to finish; null when not configured or not ready. */
  getToken: () => Promise<string | null>;
  /** After each attempt: tokens are single-use. */
  reset: () => void;
  /** A short Arabic message while the check refreshes or fails. */
  message: string;
};

export function useTurnstile(action: string): TurnstileHandle {
  const siteKey = turnstileSiteKey();
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const token = useRef<string | null>(null);
  const waiting = useRef<((value: string | null) => void)[]>([]);
  const [message, setMessage] = useState("");
  // The script could not load (blocked or offline): no token will come, so do not wait for one.
  const unavailable = useRef(false);
  const settle = (value: string | null) => { const list = waiting.current; waiting.current = []; list.forEach(resolve => resolve(value)); };

  useEffect(() => {
    if (!siteKey || !box.current) return;
    let live = true;
    loadTurnstile().then(widget => {
      if (!live || !box.current) return;
      id.current = widget.render(box.current, {
        sitekey: siteKey, action, appearance: "interaction-only", language: "ar", theme: theme(),
        "refresh-expired": "auto", retry: "auto",
        callback: (value: string) => { token.current = value; setMessage(""); settle(value); },
        "expired-callback": () => { token.current = null; setMessage("انتهت صلاحية التحقق، نحدّثه الحين…"); },
        "error-callback": () => {
          token.current = null;
          setMessage("تعذر التحقق من الاتصال. نحاول مرة ثانية تلقائيًا…");
          // Turnstile retries by itself ("retry: auto").
          return true;
        },
      });
    }).catch(() => { unavailable.current = true; settle(null); if (live) setMessage("تعذر تحميل التحقق الأمني. تأكد من الاتصال وحدّث الصفحة."); });
    return () => { live = false; if (id.current && window.turnstile) window.turnstile.remove(id.current); id.current = null; settle(null); };
  }, [siteKey, action]);

  const getToken = useCallback(async () => {
    if (!siteKey) return null;
    if (token.current) return token.current;
    if (unavailable.current) return null;
    return new Promise<string | null>(resolve => {
      waiting.current.push(resolve);
      window.setTimeout(() => { waiting.current = waiting.current.filter(item => item !== resolve); resolve(null); }, 15000);
    });
  }, [siteKey]);
  const reset = useCallback(() => {
    token.current = null;
    if (id.current && window.turnstile) window.turnstile.reset(id.current);
  }, []);

  return {
    enabled: Boolean(siteKey), getToken, reset, message,
    widget: siteKey ? <div className="turnstile-box" ref={box} data-action={action} /> : null,
  };
}

/** The message under a form when the check could not be completed. */
export const captchaMissing = "تعذر إكمال التحقق الأمني. انتظر لحظة وحاول مرة ثانية، أو حدّث الصفحة.";
