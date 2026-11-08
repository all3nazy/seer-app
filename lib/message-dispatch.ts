import { e164 } from "./messaging";

/**
 * Provider adapters for the automatic sender. Each returns { ok, ref } or { ok: false, error }.
 * Keys come only from the server environment. WhatsApp Cloud API needs approved templates for
 * messages a family did not start; plain text works inside the 24-hour customer window.
 */
export type SendResult = { ok: true; ref: string } | { ok: false; error: string };
export type Outgoing = { id: string; to_phone: string; body: string; channel: "whatsapp" | "sms" };

export async function sendWith(provider: string, message: Outgoing, sender: string | null, fetcher: typeof fetch = fetch): Promise<SendResult> {
  const to = e164(message.to_phone);
  if (!to) return { ok: false, error: "رقم غير صالح" };
  if (provider === "taqnyat") {
    const key = process.env.TAQNYAT_API_KEY;
    if (!key) return { ok: false, error: "TAQNYAT_API_KEY not set" };
    const response = await fetcher("https://api.taqnyat.sa/v1/messages", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipients: [to], body: message.body, sender: sender ?? process.env.TAQNYAT_SENDER ?? "" }) });
    const data = await response.json().catch(() => ({})) as { messageId?: string | number; message?: string };
    return response.ok ? { ok: true, ref: String(data.messageId ?? "") } : { ok: false, error: `taqnyat ${response.status} ${data.message ?? ""}`.trim() };
  }
  if (provider === "whatsapp_cloud") {
    const token = process.env.WHATSAPP_TOKEN, phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) return { ok: false, error: "WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set" };
    const response = await fetcher(`https://graph.facebook.com/v21.0/${phoneId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: message.body, preview_url: true } }) });
    const data = await response.json().catch(() => ({})) as { messages?: { id: string }[]; error?: { message?: string } };
    return response.ok && data.messages?.[0]?.id ? { ok: true, ref: data.messages[0].id } : { ok: false, error: `whatsapp ${response.status} ${data.error?.message ?? ""}`.trim() };
  }
  return { ok: false, error: `provider ${provider} not wired yet` };
}
