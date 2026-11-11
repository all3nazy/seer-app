export type SettingsTab = "account" | "organization" | "device" | "help";

/** Old anchors from before the tabs, and the tab that now holds each. */
const legacy: Record<string, SettingsTab> = { notify: "device", app: "device", general: "device", sections: "organization", team: "organization", me: "account", phone: "account", password: "account" };

/** The tab a hash opens: the tab itself, the tab of an old anchor, or the first tab. */
export function settingsTabFor(hash: string, available: SettingsTab[]): SettingsTab {
  const wanted = (available as string[]).includes(hash) ? hash as SettingsTab : legacy[hash];
  return wanted && available.includes(wanted) ? wanted : available[0];
}
