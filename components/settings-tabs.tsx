"use client";
import { useEffect, useState } from "react";
import { settingsTabFor, type SettingsTab } from "../lib/settings-tabs";
import { HASH_EVENT } from "../lib/onboarding";

/**
 * Settings in tabs that follow the address hash (#account, #organization, #device, #help), so a
 * link can open a tab. Old links (#notify, #sections, #app) open the tab that now holds them.
 */
export function SettingsTabs({ tabs }: { tabs: { id: SettingsTab; label: string; content: React.ReactNode }[] }) {
  const ids = tabs.map(tab => tab.id);
  const [active, setActive] = useState<SettingsTab>(ids[0]);
  useEffect(() => {
    const sync = () => {
      const hash = decodeURIComponent(location.hash.slice(1));
      const tab = settingsTabFor(hash, ids);
      setActive(tab);
      // An old anchor inside a tab (e.g. #notify) still scrolls to its section once the tab shows.
      if (hash && hash !== tab) requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }));
    };
    sync();
    // "hashchange" for links and the address bar; HASH_EVENT and "popstate" for moves made with the
    // History API (the app's router, the guided setup), which do not fire "hashchange".
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    window.addEventListener(HASH_EVENT, sync);
    return () => { window.removeEventListener("hashchange", sync); window.removeEventListener("popstate", sync); window.removeEventListener(HASH_EVENT, sync); };
  }, [ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (id: SettingsTab) => { setActive(id); history.replaceState(null, "", `#${id}`); };
  return <div className="settings-tabs">
    <div className="segments settings-tablist" role="tablist" aria-label="أقسام الإعدادات">
      {tabs.map(tab => <button key={tab.id} type="button" role="tab" id={`tab-${tab.id}`} aria-selected={active === tab.id} aria-controls={`panel-${tab.id}`}
        tabIndex={active === tab.id ? 0 : -1} className={active === tab.id ? "is-active" : undefined} onClick={() => pick(tab.id)}
        onKeyDown={event => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          // Right-to-left: ArrowLeft moves to the next tab.
          const step = event.key === "ArrowLeft" ? 1 : -1;
          const next = ids[(ids.indexOf(active) + step + ids.length) % ids.length];
          pick(next);
          document.getElementById(`tab-${next}`)?.focus();
        }}>{tab.label}</button>)}
    </div>
    {tabs.map(tab => <div key={tab.id} role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} className="stack settings-panel" hidden={active !== tab.id}>{tab.content}</div>)}
  </div>;
}
