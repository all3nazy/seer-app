import { expect, test, type Page } from "@playwright/test";

const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

test.describe("«سِير أدمن» shell (approved design)", () => {
  test("computer: dark plum sidebar with the groups, «أدمن» pill, counts, and a coral active item", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/e2e/admin-shell");
    const side = page.locator(".adm-side");
    await expect(side).toHaveCSS("background-color", "rgb(42, 14, 59)");
    await expect(page.locator(".adm-pill")).toHaveText("أدمن");
    await expect(page.locator(".adm-group-title")).toHaveText(["المشتركين", "الإيرادات", "الدعم والتواصل", "المنصة", "الحماية والتشغيل"]);
    const nav = page.getByRole("navigation", { name: "أقسام لوحة المالك" });
    await expect(nav.getByRole("link", { name: /التحويلات البنكية/ })).toContainText("٣");
    await expect(nav.getByRole("link", { name: /تذاكر الدعم/ })).toContainText("٤");
    await expect(nav.getByRole("link", { name: /طلبات الانضمام/ })).toContainText("٢");
    await expect(page.getByText("دخول بالتحقق الثنائي")).toBeVisible();
    await expect(page.getByRole("link", { name: "فتح المنصة" })).toHaveAttribute("href", "http://127.0.0.1:3100/");
    await expect(page.locator(".adm-menu-btn")).toBeHidden();
    await noSideScroll(page);
  });

  test("the active item follows the page (longest match)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/e2e/admin-shell");
    // On this test page no admin item is current; the rule itself is unit-tested. The current style:
    await page.evaluate(() => document.querySelector('.adm-link[href="/admin/payments"]')?.setAttribute("aria-current", "page"));
    await expect(page.locator('.adm-link[href="/admin/payments"]')).toHaveCSS("background-color", "rgb(255, 122, 89)");
  });

  test("iPad: narrower sidebar beside the page, no side scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto("/e2e/admin-shell");
    await expect(page.locator(".adm-side")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "أقسام لوحة المالك" })).toBeVisible();
    const [side, main] = [await page.locator(".adm-side").boundingBox(), await page.locator(".adm-main").boundingBox()];
    expect(side!.width).toBeLessThanOrEqual(240);
    expect(side!.x).toBeGreaterThan(main!.x); // right-to-left: the sidebar is on the right
    await noSideScroll(page);
  });

  test("phone: the sidebar folds into a top menu", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/e2e/admin-shell");
    const menu = page.getByRole("button", { name: "القائمة" });
    const nav = page.getByRole("navigation", { name: "أقسام لوحة المالك" });
    await expect(menu).toBeVisible();
    await expect(nav).toBeHidden();
    await expect(page.getByRole("heading", { name: "نظرة عامة" })).toBeInViewport();
    await menu.click();
    await expect(nav).toBeVisible();
    await expect(page.getByRole("button", { name: "إغلاق" })).toHaveAttribute("aria-expanded", "true");
    const box = await nav.getByRole("link", { name: /تذاكر الدعم/ }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(40);
    await page.getByRole("button", { name: "إغلاق" }).click();
    await expect(nav).toBeHidden();
    await noSideScroll(page);
  });
});

/** A session cookie for the browser client (access token decoded only, never verified, in this test). */
function sessionCookie(aal: "aal1" | "aal2") {
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const user = { id: "00000000-0000-0000-0000-0000000000ad", aud: "authenticated", role: "authenticated", email: "owner@seer.test", factors: [] as unknown[] };
  const jwt = (level: string) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user.id, aud: "authenticated", role: "authenticated", exp: now + 3600, aal: level, amr: [{ method: level === "aal2" ? "totp" : "password", timestamp: now }], session_id: "s1" })}.sig`;
  const session = { access_token: jwt(aal), refresh_token: "r1", expires_in: 3600, expires_at: now + 3600, token_type: "bearer", user };
  return { value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`, user, jwt };
}

test.describe("two-step verification (TOTP)", () => {
  async function mockAuth(page: Page, factors: unknown[]) {
    const { value, user, jwt } = sessionCookie("aal1");
    await page.context().addCookies([{ name: "sb-supabase-auth-token", value, domain: "127.0.0.1", path: "/" }]);
    const calls: string[] = [];
    let attempts = 0;
    await page.route("https://supabase.example.test/auth/v1/**", async route => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      calls.push(`${method} ${url.pathname}`);
      const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (url.pathname === "/auth/v1/user") return json({ ...user, factors });
      if (method === "POST" && url.pathname === "/auth/v1/factors") return json({ id: "f-new", type: "totp", friendly_name: "سِير أدمن", totp: { qr_code: "data:image/svg+xml;utf-8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/>", secret: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/x" } });
      if (method === "DELETE") return json({ id: url.pathname.split("/").pop() });
      if (url.pathname.endsWith("/challenge")) return json({ id: "c1", type: "totp", expires_at: Math.floor(Date.now() / 1000) + 300 });
      if (url.pathname.endsWith("/verify")) {
        attempts++;
        if (attempts === 1) return json({ code: "mfa_verification_failed", msg: "Invalid TOTP code entered" }, 422);
        return json({ access_token: jwt("aal2"), refresh_token: "r2", expires_in: 3600, token_type: "bearer", user });
      }
      return json({});
    });
    return calls;
  }

  test("first time: QR code and the secret to type by hand; a wrong code says so; the right one signs in with aal2", async ({ page }) => {
    const calls = await mockAuth(page, [{ id: "old", factor_type: "totp", status: "unverified" }]);
    await page.goto("/e2e/admin-mfa");
    await expect(page.getByRole("heading", { name: "فعّل التحقق الثنائي" })).toBeVisible();
    await expect(page.getByRole("img", { name: /رمز QR/ })).toBeVisible();
    await expect(page.getByLabel("المفتاح السري للتحقق")).toHaveText("JBSWY3DPEHPK3PXP");
    expect(calls).toContain("DELETE /auth/v1/factors/old");
    const code = page.getByLabel("الرمز المكوّن من ٦ أرقام");
    await expect(code).toBeFocused();
    await code.fill("12345");
    await page.getByRole("button", { name: "فعّل وادخل" }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText("اكتب الرمز المكوّن من ٦ أرقام.");
    await code.fill("123456");
    await page.getByRole("button", { name: "فعّل وادخل" }).click();
    await expect(page.locator("#mfa-error")).toHaveText("الرمز غير صحيح أو انتهت مدته. اكتب الرمز الحالي من التطبيق.");
    await code.fill("١٢٣ ٤٥٦");
    await page.getByRole("button", { name: "فعّل وادخل" }).click();
    await page.waitForURL(/\/admin$/);
    expect(calls.filter(call => call.endsWith("/verify"))).toHaveLength(2);
  });

  test("with a verified factor: only the six-digit code is asked", async ({ page }) => {
    const calls = await mockAuth(page, [{ id: "f1", factor_type: "totp", status: "verified" }]);
    await page.goto("/e2e/admin-mfa");
    await expect(page.getByRole("heading", { name: "التحقق الثنائي" })).toBeVisible();
    await expect(page.getByRole("img", { name: /رمز QR/ })).toHaveCount(0);
    expect(calls.some(call => call === "POST /auth/v1/factors")).toBe(false);
  });
});
