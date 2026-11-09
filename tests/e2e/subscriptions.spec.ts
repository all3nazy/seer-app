import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test(`pricing and sign-up render in Arabic RTL at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/pricing");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1, name: "باقات سِير" })).toBeVisible();
    await expect(page.getByRole("link", { name: "جرّب مجانًا" })).toHaveAttribute("href", "/signup");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goto("/signup");
    await expect(page.getByRole("heading", { level: 1, name: "ابدأ تجربتك المجانية" })).toBeVisible();
    for (const label of ["اسمك", "رقم الجوال", "البريد الإلكتروني", "كلمة المرور", "اسم المنشأة", "نوع المنشأة"]) await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("sign-up checks the password before sending anything", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("اسمك", { exact: true }).fill("هدى");
  await page.getByLabel("رقم الجوال", { exact: true }).fill("0501234567");
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill("huda@example.com");
  await page.getByLabel("كلمة المرور", { exact: true }).fill("abcdefgh");
  await page.getByLabel("اسم المنشأة", { exact: true }).fill("روضة الورد");
  await page.getByRole("button", { name: "ابدأ التجربة المجانية" }).click();
  await expect(page.locator(".form-error")).toContainText("كلمة المرور ٨ أحرف");
});

test("anonymous visitors are sent to sign-in from billing and the platform console", async ({ page }) => {
  for (const path of ["/dashboard/billing", "/admin", "/admin/payments", "/admin/subscribers", "/admin/plans", "/admin/settings"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/^http:\/\/(127\.0\.0\.1|localhost):3100\/login$/);
  }
});
