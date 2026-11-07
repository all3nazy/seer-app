"use client";
// Interface sounds are synthesized with Web Audio: no audio files, no network.
// They are off until the person turns them on, and the choice stays in this browser only.
export type Cue = "tap" | "move" | "done" | "error" | "message";
const KEY = "seer-sound";
let context: AudioContext | null = null;

export function soundEnabled(): boolean {
  try { return window.localStorage.getItem(KEY) === "on"; } catch { return false; }
}
export function setSoundEnabled(on: boolean) {
  try { window.localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* storage may be blocked */ }
  window.dispatchEvent(new CustomEvent("seer-sound", { detail: on }));
}
const notes: Record<Cue, [number, number][]> = {
  tap: [[660, 0]],
  move: [[523.25, 0], [659.25, 0.06]],
  done: [[523.25, 0], [659.25, 0.08], [783.99, 0.16], [1046.5, 0.26]],
  error: [[311.13, 0], [233.08, 0.12]],
  message: [[880, 0], [1174.66, 0.07]],
};
export function play(cue: Cue) {
  if (typeof window === "undefined" || !soundEnabled()) return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context ??= new Ctor();
    const now = context.currentTime;
    for (const [frequency, offset] of notes[cue]) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = cue === "error" ? "triangle" : "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.08, now + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22);
      osc.connect(gain).connect(context.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.25);
    }
  } catch { /* sound is decorative; never block the action */ }
}
