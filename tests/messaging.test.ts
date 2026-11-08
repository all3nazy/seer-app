import { describe, expect, it, vi } from "vitest";
import { messageSettingsValues } from "../lib/messaging";
import { sendWith } from "../lib/message-dispatch";

const form = (values: Record<string, string>) => { const data = new FormData(); for (const [k, v] of Object.entries(values)) data.set(k, v); return data; };
describe("message settings", () => {
  it("reads toggles and checks the site address", () => {
    const values = messageSettingsValues(form({ provider: "manual", site_url: "https://seer-app-psi.vercel.app/", notify_absence: "on", confirm_pickup: "on" }));
    expect(values).toMatchObject({ provider: "manual", channel: "whatsapp", site_url: "https://seer-app-psi.vercel.app", notify_absence: true, notify_late: false, confirm_pickup: true });
    expect(() => messageSettingsValues(form({ provider: "manual", site_url: "http://x.com" }))).toThrow("https");
    expect(() => messageSettingsValues(form({ provider: "pigeon", site_url: "https://x.com" }))).toThrow();
  });
});
describe("dispatch adapters", () => {
  it("refuses without keys and sends through Taqnyat with an international number", async () => {
    const message = { id: "m", to_phone: "0501234567", body: "مرحبا", channel: "sms" as const };
    delete process.env.TAQNYAT_API_KEY;
    expect(await sendWith("taqnyat", message, null)).toMatchObject({ ok: false });
    process.env.TAQNYAT_API_KEY = "k";
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ messageId: 77 }), { status: 201 }));
    expect(await sendWith("taqnyat", message, "SCHOOL", fetcher as unknown as typeof fetch)).toEqual({ ok: true, ref: "77" });
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toEqual({ recipients: ["966501234567"], body: "مرحبا", sender: "SCHOOL" });
    delete process.env.TAQNYAT_API_KEY;
  });
  it("rejects bad numbers and unknown providers", async () => {
    expect(await sendWith("taqnyat", { id: "m", to_phone: "12", body: "x", channel: "sms" }, null)).toEqual({ ok: false, error: "رقم غير صالح" });
    expect(await sendWith("pigeon", { id: "m", to_phone: "0501234567", body: "x", channel: "sms" }, null)).toMatchObject({ ok: false });
  });
});
