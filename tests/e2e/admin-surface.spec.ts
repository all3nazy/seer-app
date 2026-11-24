import { expect, test } from "@playwright/test";

const APP = "http://127.0.0.1:3100";
const ADMIN = "http://127.0.0.1:3101";
// `next start` reports its host as localhost to redirects; on Vercel it is the real address.
const adminAt = (path: string) => new RegExp(`^http://(127\\.0\\.0\\.1|localhost):3101${path.replace(/[/.]/g, "\\$&")}$`);

test.describe("the subscriber platform has no /admin", () => {
  for (const path of ["/admin", "/admin/support", "/admin/subscribers", "/admin/login", "/admin/verify"]) {
    test(`${path} → the normal Arabic 404`, async ({ page }) => {
      const response = await page.goto(`${APP}${path}`);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { name: "الصفحة غير موجودة" })).toBeVisible();
      await expect(page.getByRole("link", { name: "تسجيل الدخول" })).toHaveAttribute("href", "/login");
    });
  }
});

test.describe("«سِير أدمن» has only /admin", () => {
  for (const path of ["/login", "/invite", "/pricing", "/privacy", "/e2e/shell", "/api/push", "/api/telegram/webhook"]) {
    test(`${path} → 404, noindex, and no link to the platform's sign-in`, async ({ page }) => {
      const response = await page.goto(`${ADMIN}${path}`);
      expect(response?.status()).toBe(404);
      expect(response?.headers()["x-robots-tag"]).toContain("noindex");
      if (!path.startsWith("/api")) {
        await expect(page.getByRole("heading", { name: "الصفحة غير موجودة" })).toBeVisible();
        await expect(page.locator('a[href="/login"]')).toHaveCount(0);
        await expect(page.getByRole("link", { name: "لوحة المالك" })).toHaveAttribute("href", "/admin");
      }
    });
  }
  test("«/» goes to the console, and without a session to the admin sign-in", async ({ page }) => {
    await page.goto(`${ADMIN}/`);
    await expect(page).toHaveURL(adminAt("/admin/login"));
    await page.goto(`${ADMIN}/admin/payments`);
    await expect(page).toHaveURL(adminAt("/admin/login"));
  });
  test("robots.txt disallows everything, and pages carry noindex", async ({ page, request }) => {
    const robots = await request.get(`${ADMIN}/robots.txt`);
    expect(await robots.text()).toBe("User-agent: *\nDisallow: /\n");
    const response = await page.goto(`${ADMIN}/admin/login`);
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
  test("its own sign-in: «سِير أدمن» branding, the server sign-in, no direct call to Supabase Auth", async ({ page }) => {
    const sent: string[] = [];
    page.on("request", request => sent.push(request.url()));
    await page.goto(`${ADMIN}/admin/login`);
    await expect(page.getByRole("heading", { name: "دخول لوحة مالك المنصة" })).toBeVisible();
    await expect(page.getByText("أدمن", { exact: true })).toBeVisible();
    await page.getByLabel("البريد أو اسم المستخدم").fill("owner@seer.test");
    await page.getByLabel("كلمة المرور").fill("wrong-password-1");
    await page.getByRole("button", { name: "التالي" }).click();
    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 15000 });
    await expect(alert).toBeFocused();
    await expect(page).toHaveURL(adminAt("/admin/login"));
    expect(sent.filter(url => url.includes("/auth/v1/"))).toEqual([]);
  });
  test("the verification page without a session goes back to the admin sign-in", async ({ page }) => {
    await page.goto(`${ADMIN}/admin/verify`);
    await expect(page).toHaveURL(adminAt("/admin/login"));
  });
});
