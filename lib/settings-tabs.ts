export type SettingsTab = "account" | "organization" | "device" | "help";

/** Old anchors and short names (e.g. #org), and the tab that holds each. */
const legacy: Record<string, SettingsTab> = {
  me: "account", phone: "account", password: "account", profile: "account",
  org: "organization", sections: "organization", team: "organization", brand: "organization", branding: "organization", colors: "organization",
  notify: "device", notifications: "device", app: "device", install: "device", general: "device", theme: "device", sound: "device",
  support: "help", tickets: "help",
};

/** The tab a hash opens: the tab itself, the tab of an old anchor, or the first tab. */
export function settingsTabFor(hash: string, available: SettingsTab[]): SettingsTab {
  const wanted = (available as string[]).includes(hash) ? hash as SettingsTab : legacy[hash];
  return wanted && available.includes(wanted) ? wanted : available[0];
}
