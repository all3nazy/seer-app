import { describe, expect, it } from "vitest";
import { linkify, platformPath } from "../lib/linkify";
import { templatePages, templatePathPattern, templateText } from "../lib/support-templates";

describe("links in support messages", () => {
  it("makes the platform's own links clickable, as paths on the current address", () => {
    expect(linkify("افتح الفريق:\n\n🔗 https://seersa.vercel.app/dashboard/team")).toEqual([
      { text: "افتح الفريق:\n\n🔗 " }, { text: "https://seersa.vercel.app/dashboard/team", href: "/dashboard/team" }]);
    expect(platformPath("https://seer-app-psi.vercel.app/dashboard/settings#device")).toBe("/dashboard/settings#device");
    expect(platformPath("https://seerksa.vercel.app/dashboard/children?x=1")).toBe("/dashboard/children?x=1");
    expect(platformPath("https://preview-123.vercel.app/dashboard", "preview-123.vercel.app")).toBe("/dashboard");
    expect(linkify("روح /dashboard/attendance وسجّل")).toEqual([{ text: "روح " }, { text: "/dashboard/attendance", href: "/dashboard/attendance" }, { text: " وسجّل" }]);
  });
  it("leaves other addresses as plain text", () => {
    for (const text of ["https://evil.test/dashboard", "http://seersa.vercel.app.evil.test/x", "https://user:pw@seersa.vercel.app/dashboard", "javascript:alert(1)", "/etc/passwd", "a/dashboard/team", "https://wa.me/966500000000"]) {
      expect(linkify(text).every(piece => !piece.href)).toBe(true);
    }
    expect(linkify("نص عادي")).toEqual([{ text: "نص عادي" }]);
    expect(linkify("")).toEqual([{ text: "" }]);
  });
  it("does not swallow punctuation after a link, and keeps every character", () => {
    const text = "شوف (https://seersa.vercel.app/dashboard/team). أو «/dashboard/finance»، وشكرًا";
    const pieces = linkify(text);
    expect(pieces.map(piece => piece.text).join("")).toBe(text);
    expect(pieces.filter(piece => piece.href).map(piece => piece.href)).toEqual(["/dashboard/team", "/dashboard/finance"]);
  });
});

describe("template text", () => {
  it("adds the page as a full link on the official address, like the database", () => {
    expect(templateText({ body: " الخطوات ", path: "/dashboard/team" }, "https://seersa.vercel.app/")).toBe("الخطوات\n\n🔗 https://seersa.vercel.app/dashboard/team");
    expect(templateText({ body: "بدون رابط", path: null }, "https://seersa.vercel.app")).toBe("بدون رابط");
  });
  it("offers only pages inside the platform, without duplicates", () => {
    expect(templatePages.length).toBeGreaterThan(15);
    for (const page of templatePages) expect(page.path).toMatch(templatePathPattern);
    expect(new Set(templatePages.map(page => page.path)).size).toBe(templatePages.length);
    expect(templatePages.map(page => page.path)).toEqual(expect.arrayContaining(["/dashboard/team", "/dashboard/billing", "/dashboard/settings#device"]));
  });
});
