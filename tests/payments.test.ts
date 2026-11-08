import { describe, expect, it } from "vitest";
import { fromHalalas, paymentSettingsValues, toHalalas } from "../lib/payments";
import { parseMoyasarEvent, secretHash } from "../lib/payment-gateways";

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
describe("Moyasar webhook parsing", () => {
  const event = { type: "payment_paid", live: true, secret_token: "s3cret-token-value", data: { id: "pay_1", status: "paid", amount: 115000, currency: "SAR", metadata: { intent: "11111111-1111-1111-1111-111111111111" } } };
  it("reads the intent, amount, currency and mode, and hashes the secret for the database to match", () => {
    expect(parseMoyasarEvent(event)).toEqual({ intent: "11111111-1111-1111-1111-111111111111", ref: "pay_1", amount: 1150, currency: "SAR", live: true, succeeded: true, reason: null, tokenHash: secretHash("s3cret-token-value") });
    expect(secretHash("s3cret-token-value")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("rejects events without a secret, intent or valid amount; test events are marked as not live", () => {
    expect(parseMoyasarEvent({ ...event, secret_token: undefined })).toBeNull();
    expect(parseMoyasarEvent({ ...event, data: { ...event.data, metadata: {} } })).toBeNull();
    expect(parseMoyasarEvent({ ...event, data: { ...event.data, amount: -5 } })).toBeNull();
    expect(parseMoyasarEvent({ ...event, live: undefined })).toMatchObject({ live: false });
  });
  it("reports failures", () => {
    expect(parseMoyasarEvent({ ...event, type: "payment_failed", data: { ...event.data, status: "failed", source: { message: "INSUFFICIENT_FUNDS" } } })).toMatchObject({ succeeded: false, reason: "INSUFFICIENT_FUNDS" });
  });
});
