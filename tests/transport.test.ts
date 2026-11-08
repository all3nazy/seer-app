import { describe, expect, it } from "vitest";
import { busMessage, defaultDirection, riderState } from "../lib/transport";

describe("transport helpers", () => {
  it("works out where a rider is", () => {
    expect(riderState([])).toBe("waiting");
    expect(riderState(["boarded"])).toBe("on_bus");
    expect(riderState(["boarded", "dropped"])).toBe("dropped");
    expect(riderState(["absent"])).toBe("absent");
  });
  it("picks the direction from Riyadh time", () => {
    expect(defaultDirection(new Date("2026-11-08T03:30:00Z"))).toBe("to_school");
    expect(defaultDirection(new Date("2026-11-08T10:30:00Z"))).toBe("to_home");
  });
  it("writes parent messages", () => {
    expect(busMessage("ريم", "dropped", "to_home", "الشمال")).toContain("عند البيت");
    expect(busMessage("ريم", "boarded", "to_school", "الشمال")).toContain("متجه للمدرسة");
  });
});
