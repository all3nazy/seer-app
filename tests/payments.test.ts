import { describe, expect, it } from "vitest";
import { fromHalalas, paymentSettingsValues, toHalalas } from "../lib/payments";
import { verifyMoyasarEvent } from "../lib/payment-gateways";

const form = (entries: [string, string][]) => { const data = new FormData(); for (const [k, v] of entries) data.append(k, v); return data; };
describe("payment settings", () => {
  it("keeps sandbox in test mode and drops unknown methods", () => {
    expect(paymentSettingsValues(form([["provider", "sandbox"], ["mode", "live"], ["methods", "mada"], ["methods", "bitcoin"], ["is_enabled", "on"]])))
      .toEqual({ provider: "sandbox", mode: "test", methods: ["mada"], publishable_key: null, is_enabled: true });
    expect(() => paymentSettingsValues(form([["provider", "moyasar"]]))).toThrow("طريقة");
    expect(paymentSettingsValues(form([["provider", "none"], ["methods", "mada"], ["is_enabled", "on"]])).is_enabled).toBe(false);
  });
  it("converts riyals and halalas", () => {
    expect(toHalalas(1150.5)).toBe(115050);
    expect(fromHalalas(115050)).toBe(1150.5);
  });
});
describe("Moyasar webhook verification", () => {
  const event = { type: "payment_paid", secret_token: "s3cret-token-value", data: { id: "pay_1", status: "paid", amount: 115000, metadata: { intent: "11111111-1111-1111-1111-111111111111" } } };
  it("accepts a signed paid event and reads the intent and amount", () => {
    expect(verifyMoyasarEvent(event, "s3cret-token-value")).toEqual({ intent: "11111111-1111-1111-1111-111111111111", ref: "pay_1", amount: 1150, succeeded: true, reason: null });
  });
  it("rejects a wrong secret or a missing intent", () => {
    expect(verifyMoyasarEvent(event, "other-secret")).toBeNull();
    expect(verifyMoyasarEvent({ ...event, data: { ...event.data, metadata: {} } }, "s3cret-token-value")).toBeNull();
    expect(verifyMoyasarEvent(event, "")).toBeNull();
  });
  it("reports failures", () => {
    expect(verifyMoyasarEvent({ ...event, type: "payment_failed", data: { ...event.data, status: "failed", source: { message: "INSUFFICIENT_FUNDS" } } }, "s3cret-token-value")).toMatchObject({ succeeded: false, reason: "INSUFFICIENT_FUNDS" });
  });
});
