import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 1000 }]) {
  test(`Arabic RTL landing and login fit ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const path of ["/", "/login"]) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", "ar");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`${path === "/" ? "landing" : "login"}-${viewport.width}.png`), fullPage: true });
    }
  });
}

test("sign-in has keyboard reachable named fields and submission", async ({ page }) => {
  await page.goto("/login");
  const email = page.getByLabel("البريد الإلكتروني", { exact: false });
  const password = page.getByLabel("كلمة المرور", { exact: false });
  await expect(email).toHaveAttribute("autocomplete", "username");
  await expect(password).toHaveAttribute("autocomplete", "current-password");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "تجاوز إلى المحتوى" })).toBeFocused();
  await email.focus();
  await expect(email).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "إظهار", exact: true })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(password).toHaveAttribute("type", "text");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "دخول", exact: true })).toBeFocused();
});

test("anonymous users cannot render protected operations or assistant", async ({ page }) => {
  for (const path of ["/dashboard", "/dashboard/operations?org=00000000-0000-0000-0000-000000000001", "/dashboard/assistant"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/^http:\/\/(127\.0\.0\.1|localhost):3100\/login$/);
    await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  }
});


test("an invalid admin invitation cannot display the password setup form", async ({ page }) => {
  await page.goto("/auth/setup");
  await expect(page.locator('p[role="alert"]')).toContainText("رابط الدعوة غير صالح");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test("an invitation callback establishes a verified session before password setup", async ({ page }) => {
  // Synthetic Auth response: this tests the browser callback, not live JWT validation.
  const id = "70000000-0000-0000-0000-000000000001";
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600 })}.c3ludGhldGlj`;
  await page.route("**/auth/v1/user", route => route.fulfill({ json: {
    id, aud: "authenticated", role: "authenticated", email: "synthetic@example.test",
    email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, identities: [],
  } }));
  await page.goto(`/auth/setup#access_token=${token}&refresh_token=synthetic-refresh&type=invite`);
  await expect(page.locator('input[type="password"]')).toHaveCount(2);
  await expect(page.getByRole("button", { name: "حفظ كلمة المرور" })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
});

test("activation requests a verification email and rejects unrelated links", async ({ page }) => {
  let verifyRequests = 0;
  await page.route("**/auth/v1/otp*", route => route.fulfill({ json: {} }));
  await page.route("**/auth/v1/verify", route => { verifyRequests++; return route.fulfill({ json: {} }); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/auth/activate");
  await expect(page.getByRole("heading", { name: "تفعيل حساب جديد" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill("synthetic@example.test");
  await page.getByRole("button", { name: "إرسال رسالة التفعيل" }).click();
  await expect(page.getByRole("status")).toContainText("رسالة تفعيل");
  await expect(page.getByRole("button", { name: /يمكن إعادة الطلب/ })).toBeDisabled();
  const field = page.getByLabel("رابط التفعيل من بريدك");
  await field.fill("https://unrelated.example/auth/v1/verify?token=synthetic-confirmation-hash&type=signup");
  await page.getByRole("button", { name: "تأكيد الرابط وإعداد كلمة المرور" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("ليس رابط تأكيد صالحًا");
  await expect(field).toHaveValue("");
  expect(verifyRequests).toBe(0);
});

test("pasted email confirmation is verified before continuing account setup", async ({ page }) => {
  const user = { id: "70000000-0000-0000-0000-000000000002", aud: "authenticated", role: "authenticated", email: "synthetic@example.test", email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, identities: [] };
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const access = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600 })}.c3ludGhldGlj`;
  let verificationBody: unknown;
  await page.route("**/auth/v1/verify", route => {
    verificationBody = route.request().postDataJSON();
    return route.fulfill({ json: { access_token: access, refresh_token: "synthetic-refresh", expires_in: 3600, token_type: "bearer", user } });
  });
  await page.route("**/auth/v1/user", route => route.fulfill({ json: user }));
  // Isolate this browser flow from a real Auth server; the setup page is tested separately.
  await page.route("**/auth/setup", route => route.fulfill({ contentType: "text/html", body: '<html lang="ar" dir="rtl"><h1>متابعة إعداد الحساب</h1></html>' }));
  await page.goto("/auth/activate");
  await page.getByLabel("رابط التفعيل من بريدك").fill("https://supabase.example.test/auth/v1/verify?token=synthetic-confirmation-hash&type=signup&redirect_to=https://unrelated.example");
  await page.getByRole("button", { name: "تأكيد الرابط وإعداد كلمة المرور" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/auth/setup");
  expect(verificationBody).toMatchObject({ token_hash: "synthetic-confirmation-hash", type: "signup" });
});
