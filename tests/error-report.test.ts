import { describe, expect, it } from "vitest";
import { selfHealing } from "../lib/error-report";
import { parseCommand } from "../lib/bot-commands";

describe("self-healing errors", () => {
  it("reloads after a new deployment's stale files and leaves other errors to the log", () => {
    expect(selfHealing(Object.assign(new Error("Loading chunk 123 failed."), { name: "ChunkLoadError" }))).toBe("reload");
    expect(selfHealing(new TypeError("Failed to fetch dynamically imported module: /x.js"))).toBe("reload");
    expect(selfHealing(new TypeError("Cannot read properties of undefined"))).toBeNull();
  });
  it("the bot understands health checks", () => {
    expect(parseCommand("فحص النظام")).toEqual({ kind: "health" });
    expect(parseCommand("صحة النظام")).toEqual({ kind: "health" });
  });
});
