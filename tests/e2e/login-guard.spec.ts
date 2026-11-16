import { expect, test } from "@playwright/test";

// Turnstile is switched on in the build when this key is set (see turnstile.spec.ts for that case).
const turnstileOn = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

test.describe("server-side sign-in", () => {
  test("the browser never calls Supabase Auth directly, Turnstile stays off until configured, and a failure shows a message with focus", async ({ page }) => {
    const sent: string[] = [];
    page.on("request", request => sent.push(request.url()));
    await page.goto("/login");
    await page.getByLabel("اسم المستخدم أو البريد الإلكتروني").fill("huda.t");
    await page.getByLabel("كلمة المرور", { exact: true }).fill("wrong-password-1");
    await page.getByRole("button", { name: "دخول", exact: true }).click();
    // The test server cannot reach the stand-in Supabase address, so sign-in fails on the server.
    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 15000 });
    await expect(alert).toBeFocused();
    await expect(page.getByRole("button", { name: "دخول", exact: true })).toBeEnabled();
    await expect(page).toHaveURL(/\/login$/);
    expect(sent.filter(url => url.includes("/auth/v1/"))).toEqual([]);
    if (!turnstileOn) {
      expect(sent.filter(url => url.includes("challenges.cloudflare.com"))).toEqual([]);
      await expect(page.locator(".turnstile-box")).toHaveCount(0);
    }
    // The password stays in the form for another try.
    await expect(page.getByLabel("كلمة المرور", { exact: true })).toHaveValue("wrong-password-1");
  });

  test("the sign-up and activation forms have no Turnstile box while it is not configured", async ({ page }) => {
    test.skip(turnstileOn, "Turnstile is configured in this build");
    for (const path of ["/auth/activate", "/login"]) {
      await page.goto(path);
      await expect(page.locator(".turnstile-box")).toHaveCount(0);
    }
  });
});
