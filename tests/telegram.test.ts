import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
import { POST as webhook } from "../app/api/telegram/webhook/route";
import { GET as dispatchGet, POST as dispatchPost } from "../app/api/telegram/dispatch/route";
import { inviteReply, replyMarkup, siteBase, telegramApi, webhookAllowed } from "../lib/telegram";

const TOKEN = "123456:TEST-TOKEN-never-printed";
const SECRET = "webhook-secret-for-tests-0123456789";
type Call = { method: string; body: Record<string, unknown> };
let calls: Call[] = [];

beforeEach(() => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", TOKEN);
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("CRON_SECRET", "cron-secret-for-tests");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-for-tests");
  vi.stubEnv("SEER_CANONICAL_HOST", "seersa.vercel.app");
  calls = [];
  mocks.rpc.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: string }) => {
    const method = url.split("/").pop()!;
    calls.push({ method, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 4242 } }), { status: 200 });
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const post = (body: unknown, secret?: string) => new NextRequest("https://seersa.vercel.app/api/telegram/webhook", {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}) },
});

describe("telegram webhook", () => {
  it("refuses requests without the secret header, or with a wrong one, before touching the database", async () => {
    for (const secret of [undefined, "wrong", `${SECRET}x`]) {
      const response = await webhook(post({ update_id: 1, message: { text: "/summary", chat: { id: 1, type: "private" } } }, secret));
      expect(response.status).toBe(401);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
  it("refuses everything when no secret is configured", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
    expect((await webhook(post({ update_id: 1 }, ""))).status).toBe(401);
    expect(webhookAllowed("", "")).toBe(false);
  });
  it("an unlinked chat gets nothing back (the database answers {})", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: {}, error: null });
    const response = await webhook(post({ update_id: 2, message: { text: "hello", chat: { id: 99, type: "private" } } }, SECRET));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("telegram_handle", { update: expect.objectContaining({ update_id: 2 }) });
    expect(calls).toEqual([]);
  });
  it("sends the database's replies, answers the button and removes its keyboard", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: {
      replies: [{ chat_id: 5, text: "✅ اعتُمد التحويل", buttons: [{ text: "فتح في اللوحة", url: "/admin/payments" }] }],
      answer: { id: "cb1", text: "اعتُمد التحويل ✓" }, clear: { chat_id: 5, message_id: 77 },
    }, error: null });
    await webhook(post({ update_id: 3, callback_query: { id: "cb1", data: "pa:x" } }, SECRET));
    expect(calls.map(call => call.method)).toEqual(["sendMessage", "answerCallbackQuery", "editMessageReplyMarkup"]);
    expect(calls[0].body).toMatchObject({ chat_id: 5, text: "✅ اعتُمد التحويل", reply_markup: { inline_keyboard: [[{ text: "فتح في اللوحة", url: "https://seersa.vercel.app/admin/payments" }]] } });
    expect(calls[2].body).toEqual({ chat_id: 5, message_id: 77, reply_markup: { inline_keyboard: [] } });
  });
  it("a reply to a ticket goes through the database (reply_support as the linked admin) and is confirmed", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { replies: [{ chat_id: 5, text: "✓ وصل ردك للمستخدم داخل المنصة." }] }, error: null });
    await webhook(post({ update_id: 4, message: { message_id: 10, text: "تم الحل", chat: { id: 5, type: "private" }, reply_to_message: { message_id: 9001 } } }, SECRET));
    expect(mocks.rpc).toHaveBeenCalledWith("telegram_handle", { update: expect.objectContaining({ message: expect.objectContaining({ reply_to_message: { message_id: 9001 } }) }) });
    expect(calls).toEqual([{ method: "sendMessage", body: expect.objectContaining({ text: "✓ وصل ردك للمستخدم داخل المنصة." }) }]);
  });
  it("«أرسل دعوة»: builds the invite link and a ready WhatsApp message to the requester", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { replies: [{ chat_id: 5, invite: { token: "AbCdEfGhJkMnPqRsTuVwXyZa23456789", org_name: "مدرسة الريادة", contact_name: "أبو خالد", phone: "0551112222", trial_months: 3 } }] }, error: null });
    await webhook(post({ update_id: 5, callback_query: { id: "cb2", data: "ji:x" } }, SECRET));
    const sent = calls[0].body as { text: string; reply_markup: { inline_keyboard: { url: string }[][] } };
    expect(sent.text).toContain("https://seersa.vercel.app/invite#AbCdEfGhJkMnPqRsTuVwXyZa23456789");
    const whatsapp = new URL(sent.reply_markup.inline_keyboard[0][0].url);
    expect(whatsapp.origin + whatsapp.pathname).toBe("https://wa.me/966551112222");
    expect(whatsapp.searchParams.get("text")).toContain("حيّاكم الله");
  });
  it("records sent messages that can be answered (tickets)", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { replies: [{ chat_id: 5, text: "تذكرة", track: { thread: "t1" } }] }, error: null }).mockResolvedValue({ data: null, error: null });
    await webhook(post({ update_id: 6, message: { text: "/x", chat: { id: 5, type: "private" } } }, SECRET));
    expect(mocks.rpc).toHaveBeenLastCalledWith("telegram_track", { chat: 5, telegram_message: 4242, context: { thread: "t1" } });
  });
});

describe("telegram dispatch", () => {
  it("needs CRON_SECRET or a valid one-time kick", async () => {
    expect((await dispatchGet(new NextRequest("https://seersa.vercel.app/api/telegram/dispatch"))).status).toBe(401);
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect((await dispatchPost(new NextRequest("https://seersa.vercel.app/api/telegram/dispatch", { method: "POST", body: JSON.stringify({ nonce: "A".repeat(43) }) }))).status).toBe(401);
    expect(mocks.rpc).toHaveBeenCalledWith("telegram_claim_kick", { nonce: "A".repeat(43) });
  });
  it("sends what is queued and reports each result (retries are scheduled by the database)", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "telegram_claim"
      ? { data: [{ id: 1, chat_id: 5, body: "🎫 تذكرة", buttons: [{ text: "إقفال", data: "sc:t1" }], context: { thread: "t1" } }], error: null }
      : { data: null, error: null });
    const response = await dispatchGet(new NextRequest("https://seersa.vercel.app/api/telegram/dispatch", { headers: { authorization: "Bearer cron-secret-for-tests" } }));
    expect(await response.json()).toEqual({ claimed: 1, sent: 1 });
    expect(calls[0].body).toMatchObject({ chat_id: 5, reply_markup: { inline_keyboard: [[{ text: "إقفال", callback_data: "sc:t1" }]] } });
    expect(mocks.rpc).toHaveBeenCalledWith("telegram_report", { message: 1, ok: true, telegram_message: 4242, error: null });
  });
});

describe("telegram helpers", () => {
  it("never puts the bot token in an error", async () => {
    const failing = vi.fn(async () => new Response(JSON.stringify({ ok: false, description: `Unauthorized for bot${TOKEN}` }), { status: 401 }));
    const result = await telegramApi("getMe", {}, TOKEN, failing as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    const network = await telegramApi("getMe", {}, TOKEN, (async () => { throw new Error(`https://api.telegram.org/bot${TOKEN}/getMe`); }) as unknown as typeof fetch);
    expect(JSON.stringify(network)).not.toContain(TOKEN);
  });
  it("puts two buttons per row and makes panel links absolute", () => {
    expect(replyMarkup([{ text: "أ", data: "a:1" }, { text: "ب", data: "b:1" }, { text: "ج", url: "/admin" }], "https://x.test")).toEqual({ inline_keyboard: [[{ text: "أ", callback_data: "a:1" }, { text: "ب", callback_data: "b:1" }], [{ text: "ج", url: "https://x.test/admin" }]] });
    expect(replyMarkup([], "https://x.test")).toBeUndefined();
  });
  it("uses the official address for links", () => {
    expect(siteBase({ SEER_CANONICAL_HOST: "seersa.vercel.app" })).toBe("https://seersa.vercel.app");
    expect(siteBase({}, "https://preview.test")).toBe("https://preview.test");
  });
  it("the invite reply says how long the link is valid", () => {
    expect(inviteReply({ token: "T".repeat(32), org_name: "روضة", trial_months: 3 }, "https://x.test").text).toContain("صالح ٧ أيام ولمرة وحدة");
  });
});
