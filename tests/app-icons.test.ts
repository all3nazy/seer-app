import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { adminIconFiles, adminIconSvg, defaultIcon, iconDesigns, iconFiles, iconSvg, iconTones, isIconChoice, parseIconChoice } from "../lib/app-icons";
import { GET } from "../app/manifest.webmanifest/route";
import { vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === "seer-icon" ? { value: "growth-dark" } : undefined }) }));

describe("app icons", () => {
  it("accepts only the six known choices and falls back to the default", () => {
    expect(isIconChoice("path-dark")).toBe(true);
    expect(isIconChoice("path-blue")).toBe(false);
    expect(isIconChoice("../../etc")).toBe(false);
    expect(parseIconChoice("nope").choice).toBe(defaultIcon);
    expect(parseIconChoice("letter-dark")).toEqual({ design: "letter", tone: "dark", choice: "letter-dark" });
  });
  it("draws every design in both tones and ships every PNG", () => {
    for (const design of iconDesigns) for (const tone of iconTones) {
      const svg = iconSvg(design, tone);
      expect(svg).toMatch(/^<svg[\s\S]*<\/svg>$/);
      expect(iconSvg(design, tone, { maskable: true })).toContain("scale(0.72)");
      for (const file of Object.values(iconFiles(`${design}-${tone}`))) expect(existsSync(`public${file}`)).toBe(true);
    }
  });
  it("the manifest follows the chosen icon and is installable", async () => {
    const manifest = await (await GET()).json();
    expect(manifest).toMatchObject({ short_name: "سِير", display: "standalone", dir: "rtl", start_url: expect.stringContaining("/dashboard"), background_color: "#0F0D2A" });
    expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual(["/icons/growth-dark-192.png", "/icons/growth-dark-512.png", "/icons/growth-dark-maskable-512.png"]);
    expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === "maskable")).toBe(true);
  });
  it("«سِير أدمن» installs as its own app with its own icon and start page", async () => {
    for (const file of Object.values(adminIconFiles)) expect(existsSync(`public${file}`)).toBe(true);
    expect(adminIconSvg({ maskable: true })).toContain("scale(0.72)");
    vi.stubEnv("SEER_APP_SURFACE", "admin");
    try {
      const manifest = await (await GET()).json();
      expect(manifest).toMatchObject({ id: "/admin", short_name: "سِير أدمن", start_url: "/admin?source=app", scope: "/admin", display: "standalone" });
      expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual([adminIconFiles.icon192, adminIconFiles.icon512, adminIconFiles.maskable]);
      expect(JSON.stringify(manifest)).not.toContain("/dashboard");
    } finally { vi.unstubAllEnvs(); }
  });
});

describe("root touch icon", () => {
  it("is the PNG of this site's icon", async () => {
    const { touchIcon } = await import("../lib/touch-icon");
    const { readFileSync } = await import("node:fs");
    vi.stubEnv("SEER_APP_SURFACE", "admin");
    try {
      const body = Buffer.from(await touchIcon().arrayBuffer());
      expect(body.equals(readFileSync("public/icons/admin-apple-180.png"))).toBe(true);
    } finally { vi.unstubAllEnvs(); }
    expect(Buffer.from(await touchIcon().arrayBuffer()).equals(readFileSync("public/icons/path-light-apple-180.png"))).toBe(true);
  });
});
