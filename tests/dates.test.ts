import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { arDigits, arNumber, formatDate, formatDateTime, formatDay, formatFullDateTime, formatTime, riyadhDate, riyadhHour } from "../lib/dates";

describe("fixed Arabic dates (Riyadh, UTC+3)", () => {
  it("midnight is ١٢ ص, noon is ١٢ م", () => {
    expect(formatTime("2026-11-11T21:00:00Z")).toBe("١٢:٠٠ ص"); // 00:00 Riyadh
    expect(formatTime("2026-11-11T21:05:00Z")).toBe("١٢:٠٥ ص");
    expect(formatTime("2026-11-12T08:59:00Z")).toBe("١١:٥٩ ص");
    expect(formatTime("2026-11-12T09:00:00Z")).toBe("١٢:٠٠ م"); // 12:00 Riyadh
    expect(formatTime("2026-11-12T10:30:00Z")).toBe("١:٣٠ م");
    expect(formatTime("2026-11-12T20:59:00Z")).toBe("١١:٥٩ م");
    expect(riyadhHour("2026-11-11T21:00:00Z")).toBe(0);
    expect(riyadhHour("2026-11-12T09:00:00Z")).toBe(12);
  });
  it("the Riyadh day changes at 21:00 UTC, including at the end of the year", () => {
    expect(formatDate("2026-12-31T20:59:00Z", { year: true })).toBe("٣١ ديسمبر ٢٠٢٦");
    expect(formatDate("2026-12-31T21:00:00Z", { year: true })).toBe("١ يناير ٢٠٢٧");
    expect(riyadhDate("2026-12-31T21:00:00Z")).toBe("2027-01-01");
    expect(riyadhDate(new Date("2026-11-07T22:30:00Z"))).toBe("2026-11-08");
    expect(formatDateTime("2026-12-31T21:30:00Z")).toBe("١ يناير، ١٢:٣٠ ص");
    expect(formatFullDateTime("2026-11-12T05:05:00Z")).toBe("الخميس، ١٢ نوفمبر ٢٠٢٦، ٨:٠٥ ص");
  });
  it("calendar days (YYYY-MM-DD) read as that day", () => {
    expect(formatDay("2026-01-01")).toBe("١ يناير");
    expect(formatDay("2026-12-31", { year: true, weekday: true })).toBe("الخميس، ٣١ ديسمبر ٢٠٢٦");
  });
  it("is the same whatever the machine's time zone (no Date local getters)", () => {
    const source = readFileSync("lib/dates.ts", "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(source).not.toMatch(/\.get(FullYear|Month|Date|Day|Hours|Minutes)\(|toLocale|Intl\./);
  });
});

describe("fixed Arabic numbers", () => {
  it("digits, grouping and decimals like ar-SA", () => {
    expect(arDigits("2026-11")).toBe("٢٠٢٦-١١");
    expect(arNumber(0)).toBe("٠");
    expect(arNumber(7)).toBe("٧");
    expect(arNumber(1234567)).toBe("١٬٢٣٤٬٥٦٧");
    expect(arNumber(1234.5)).toBe("١٬٢٣٤٫٥");
    expect(arNumber(2.3456)).toBe("٢٫٣٤٦");
    expect(arNumber(150, { min: 2, max: 2 })).toBe("١٥٠٫٠٠");
    expect(arNumber(99.999, { max: 2 })).toBe("١٠٠");
    expect(arNumber(12345, { grouping: false })).toBe("١٢٣٤٥");
    expect(arNumber(null)).toBe("");
    expect(arNumber(undefined)).toBe("");
  });
});

/** Files that run in the browser: "use client" files and everything they import from the project. */
function clientFiles(): string[] {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? (name === "node_modules" ? [] : walk(path)) : /\.tsx?$/.test(name) ? [path] : [];
  });
  const all = ["app", "components", "lib"].flatMap(walk);
  const seen = new Set<string>();
  const queue = all.filter(file => /^\s*["']use client["']/.test(readFileSync(file, "utf8")));
  while (queue.length) {
    const file = queue.pop()!;
    // Server actions run on the server even when a client component imports them.
    if (seen.has(file) || /^\s*["']use server["']/.test(readFileSync(file, "utf8"))) continue;
    seen.add(file);
    for (const match of readFileSync(file, "utf8").matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
      const base = join(dirname(file), match[1]);
      const target = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find(existsSync);
      if (target) queue.push(target);
    }
  }
  return [...seen].map(file => relative(".", file)).sort();
}

describe("no locale formatting in browser code (hydration, React #418)", () => {
  it("client components and what they import use lib/dates, not toLocale* or Intl", () => {
    const files = clientFiles();
    expect(files).toEqual(expect.arrayContaining(["components/support-thread.tsx", "lib/finance.ts", "lib/tasks.ts"]));
    const offenders = files.filter(file => file !== "lib/dates.ts").flatMap(file => {
      const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      return [...code.matchAll(/\.toLocale(?:String|DateString|TimeString)\s*\(|\bIntl\.(?:DateTimeFormat|NumberFormat|RelativeTimeFormat)\b/g)].map(match => `${file}: ${match[0]}`);
    });
    expect(offenders).toEqual([]);
  });
});
