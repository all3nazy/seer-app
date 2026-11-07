"use client";
import { useEffect, useState } from "react";
import { play, type Cue } from "../lib/sound";

type ToastItem = { id: number; text: string; kind: "info" | "error" };
type Piece = { id: number; left: number; dx: number; rot: number; color: string; delay: number };
const colors = ["#7C5CFF", "#FF7A59", "#22C55E", "#F5F4FB", "#FBBF24"];

/** Announce a result to the person: a short toast, an optional sound cue. */
export function notify(text: string, kind: "info" | "error" = "info", cue?: Cue) {
  window.dispatchEvent(new CustomEvent("seer-toast", { detail: { text, kind } }));
  play(cue ?? (kind === "error" ? "error" : "tap"));
}
/** The one celebratory moment: finishing a task. */
export function celebrate() {
  window.dispatchEvent(new Event("seer-celebrate"));
  play("done");
}

export function FeedbackLayer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  useEffect(() => {
    let next = 0;
    const onToast = (event: Event) => {
      const { text, kind } = (event as CustomEvent<{ text: string; kind: "info" | "error" }>).detail;
      const id = ++next;
      setToasts(items => [...items.slice(-2), { id, text, kind }]);
      window.setTimeout(() => setToasts(items => items.filter(item => item.id !== id)), kind === "error" ? 6000 : 3200);
    };
    const onCelebrate = () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const batch = Array.from({ length: 36 }, (_, index) => ({
        id: Date.now() + index, left: Math.random() * 100, dx: (Math.random() - 0.5) * 240,
        rot: Math.random() * 720 - 360, color: colors[index % colors.length], delay: Math.random() * 0.25,
      }));
      setPieces(batch);
      window.setTimeout(() => setPieces([]), 1800);
    };
    window.addEventListener("seer-toast", onToast);
    window.addEventListener("seer-celebrate", onCelebrate);
    return () => { window.removeEventListener("seer-toast", onToast); window.removeEventListener("seer-celebrate", onCelebrate); };
  }, []);
  return <>
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map(toast => <div key={toast.id} className={`toast${toast.kind === "error" ? " error" : ""}`} role={toast.kind === "error" ? "alert" : undefined}>{toast.text}</div>)}
    </div>
    {pieces.length ? <div className="confetti" aria-hidden="true">{pieces.map(piece => <i key={piece.id} style={{ left: `${piece.left}%`, background: piece.color, animationDelay: `${piece.delay}s`, ["--dx" as string]: `${piece.dx}px`, ["--rot" as string]: `${piece.rot}deg` }} />)}</div> : null}
  </>;
}
