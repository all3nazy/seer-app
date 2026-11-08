"use client";
import { useEffect } from "react";
import { reportError, selfHealing } from "../lib/error-report";

/**
 * Watches for uncaught errors on every page. Known self-healing cases are handled on the spot (after
 * a new deployment, stale files are fixed with one reload); everything else goes to the error log.
 */
export function ErrorWatch() {
  useEffect(() => {
    const handle = (error: unknown) => {
      const heal = selfHealing(error);
      if (heal === "reload") {
        try { if (sessionStorage.getItem("seer-healed") === location.pathname) return; sessionStorage.setItem("seer-healed", location.pathname); } catch { /* ignore */ }
        location.reload();
        return;
      }
      if (heal === "offline") return;
      void reportError(error);
    };
    const onError = (event: ErrorEvent) => handle(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => handle(event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);
  return null;
}
