import { expect, test } from "@playwright/test";

test("unknown addresses show the Arabic 404 with the way back", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "الصفحة غير موجودة" })).toBeVisible();
  await expect(page.getByText("ممكن الرابط ناقص أو انتهت صلاحيته")).toBeVisible();
  await expect(page.getByRole("link", { name: "الرئيسية", exact: true })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "تسجيل الدخول" })).toHaveAttribute("href", "/login");
});

for (const [path, title] of [["/privacy", "سياسة الخصوصية"], ["/terms", "شروط الاستخدام"]] as const) {
  test(`${path} is readable in Arabic on a phone, with its contents`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "المحتويات" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("the legal pages are linked from the landing page, pricing and sign-in", async ({ page }) => {
  for (const path of ["/", "/pricing", "/login"]) {
    await page.goto(path);
    await expect(page.locator("footer.legal-links").getByRole("link", { name: "سياسة الخصوصية" }), path).toHaveAttribute("href", "/privacy");
    await expect(page.locator("footer.legal-links").getByRole("link", { name: "شروط الاستخدام" }), path).toHaveAttribute("href", "/terms");
  }
});
