"use client";
import { useSyncExternalStore } from "react";

/**
 * The support badge, live and without extra requests: it starts from the unread threads the page was
 * rendered with, adds a thread when a support notification arrives through the bell's realtime
 * channel, and drops it the moment its thread is opened (which also marks it read in the database).
 */
type State = { mine: Set<string>; team: Set<string> | null; viewing: string | null; seededWith: string };
const state: State = { mine: new Set(), team: null, viewing: null, seededWith: "" };
let snapshot = { mine: 0, team: null as number | null };
const listeners = new Set<() => void>();
const emit = () => { snapshot = { mine: state.mine.size, team: state.team ? state.team.size : null }; listeners.forEach(listener => listener()); };

/** Starts from the server's list; a new list (next page load) replaces it. */
export function seedSupportBadge(mine: string[], team: string[] | null) {
  const key = JSON.stringify([mine, team]);
  if (state.seededWith === key) return;
  state.seededWith = key;
  state.mine = new Set(mine.filter(id => id !== state.viewing));
  state.team = team ? new Set(team.filter(id => id !== state.viewing)) : null;
  emit();
}

const threadIn = (url: string | null) => url?.match(/^\/(dashboard|admin)\/support\/([0-9a-f-]{36})$/i) ?? null;
/** A support notification from the bell's channel: a new reply (user) or a new ticket/reply (team). */
export function supportNotification(item: { kind: string; url: string | null }) {
  if (item.kind !== "support") return;
  const match = threadIn(item.url);
  if (!match || match[2] === state.viewing) return;
  const target = match[1] === "admin" ? state.team : state.mine;
  if (!target || target.has(match[2])) return;
  target.add(match[2]);
  emit();
}

/** The thread on screen: it is read, and stays read while open. */
export function viewingSupportThread(id: string | null) {
  state.viewing = id;
  if (id && (state.mine.delete(id) || state.team?.delete(id))) emit();
}

export function useSupportBadge(): { mine: number; team: number | null } {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => snapshot, () => snapshot);
}
