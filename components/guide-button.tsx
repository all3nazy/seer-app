"use client";
import { requestGuide, type GuideRequest } from "../lib/onboarding";

/** Starts the guide (the setup, or a tour of this page) and closes the assistant so the page shows. */
export function startGuide(mode: GuideRequest["mode"]) {
  window.dispatchEvent(new Event("seer:close-bot"));
  requestGuide({ mode });
}

export function GuideButton({ mode = "setup", label = "شغّل الشرح", className = "btn btn-primary" }: { mode?: GuideRequest["mode"]; label?: string; className?: string }) {
  return <button type="button" className={className} onClick={() => startGuide(mode)}>{label}</button>;
}
