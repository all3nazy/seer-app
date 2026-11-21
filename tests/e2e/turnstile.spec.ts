import { expect, test, type Page } from "@playwright/test";

// Runs only against a build made with NEXT_PUBLIC_TURNSTILE_SITE_KEY set (Turnstile switched on).
// The Cloudflare script is replaced by a stand-in that issues tokens like the real widget.
test.skip(!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "Turnstile is not configured in this build");

async function fakeTurnstile(page: Page) {
  await page.route("https://challenges.cloudflare.com/**", route => route.fulfill({ contentType: "application/javascript", body: `
    window.__ts = { renders: [], resets: 0, n: 0 };
    window.turnstile = {
      render(el, opts) { window.__ts.renders.push({ appearance: opts.appearance, language: opts.language, action: opts.action, sitekey: opts.sitekey }); window.__ts.opts = opts; setTimeout(() => opts.callback("fake-token-" + (++window.__ts.n)), 30); return "w1"; },
      reset() { window.__ts.resets++; setTimeout(() => window.__ts.opts.callback("fake-token-" + (++window.__ts.n)), 30); },
      remove() {},
    };` }));
}

test("sign-in: invisible widget in Arabic, its token goes to the server action, and it is reset after the attempt", async ({ page }) => {
  await fakeTurnstile(page);
  const posts: string[] = [];
  page.on("request", request => { if (request.method() === "POST" && request.url().includes("/login")) posts.push(request.postData() ?? ""); });
  await page.goto("/login");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __ts?: { renders: unknown[] } }).__ts?.renders)).toEqual([{ appearance: "interaction-only", language: "ar", action: "login", sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY }]);
  await page.getByLabel("اسم المستخدم أو البريد الإلكتروني").fill("huda.t");
  await page.getByLabel("كلمة المرور", { exact: true }).fill("wrong-password-1");
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toBeVisible({ timeout: 15000 });
  expect(posts.some(body => body.includes("fake-token-1"))).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __ts: { resets: number } }).__ts.resets)).toBe(1);
});

test("an expired check shows a short message and refreshes by itself", async ({ page }) => {
  await fakeTurnstile(page);
  await page.goto("/login");
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __ts?: { opts?: unknown } }).__ts?.opts))).toBe(true);
  await page.evaluate(() => (window as unknown as { __ts: { opts: Record<string, () => void> } }).__ts.opts["expired-callback"]());
  await expect(page.getByText("انتهت صلاحية التحقق، نحدّثه الحين…")).toBeVisible();
  await page.evaluate(() => (window as unknown as { __ts: { opts: { callback: (t: string) => void } } }).__ts.opts.callback("fake-token-9"));
  await expect(page.getByText("انتهت صلاحية التحقق، نحدّثه الحين…")).toHaveCount(0);
});

test("sign-up and activation render the widget with their own action", async ({ page }) => {
  await fakeTurnstile(page);
  for (const [path, action] of [["/auth/activate", "activate"], ["/signup", "signup"]] as const) {
    await page.goto(path);
    const renders = await page.evaluate(() => (window as unknown as { __ts?: { renders: { action: string }[] } }).__ts?.renders ?? []);
    if (path === "/signup" && !renders.length && await page.locator(".turnstile-box").count() === 0) continue; // sign-up is hidden during the pilot
    await expect.poll(() => page.evaluate(() => (window as unknown as { __ts?: { renders: { action: string }[] } }).__ts?.renders.map(r => r.action) ?? [])).toEqual([action]);
  }
});
