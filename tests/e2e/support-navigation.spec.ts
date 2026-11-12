import { expect, test } from "@playwright/test";

test.describe("«الدعم» in the menu", () => {
  test("computer: in the sidebar footer next to settings, with the count of new replies", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 850 });
    await page.goto("/e2e/shell?replies=2");
    const link = page.locator(".sidebar-foot").getByRole("link", { name: /^الدعم/ });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/dashboard/support");
    await expect(link).toHaveAccessibleName("الدعم: ٢ فيها رد جديد");
    await expect(link.locator(".nav-badge")).toHaveText("٢");
    // Same group as «الاشتراك» and «الإعدادات».
    await expect(page.locator(".sidebar-foot").getByRole("link", { name: "الإعدادات" })).toBeVisible();
  });
  test("no badge when nothing is new", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 850 });
    await page.goto("/e2e/shell");
    await expect(page.locator(".sidebar-foot .support-link")).toBeVisible();
    await expect(page.locator(".sidebar-foot .support-link .nav-badge")).toHaveCount(0);
  });
  test("platform admin: the link goes to the team inbox with the tickets waiting for a reply", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 850 });
    await page.goto("/e2e/shell?admin=1&waiting=3");
    const link = page.locator(".sidebar-foot .support-link");
    await expect(link).toHaveAttribute("href", "/admin/support");
    await expect(link).toHaveAccessibleName("الدعم: ٣ بانتظار ردّك");
  });
  test("iPad: the support icon shows in the slim rail", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto("/e2e/shell?replies=1");
    await expect(page.locator(".sidebar-foot .support-link")).toBeVisible();
  });
  test("phone: «المزيد» shows a dot, and «الدعم» is the first row there", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/e2e/shell?replies=2");
    const more = page.locator(".tabbar").getByRole("link", { name: /المزيد/ });
    await expect(more).toBeVisible();
    await expect(more.locator(".tab-dot")).toBeVisible();
    const first = page.locator("main .group .group-row").first();
    await expect(first).toContainText("الدعم");
    await expect(first).toHaveAttribute("href", "/dashboard/support");
    await expect(first.locator(".nav-badge")).toHaveText("٢");
  });
});

test.describe("the support badge follows the bell's live notifications and clears when read", () => {
  test("a live reply adds to the badge; opening a thread clears it at once; the open thread is not counted again", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 850 });
    await page.goto("/e2e/shell?replies=2");
    const badge = page.locator(".sidebar-foot .support-link .nav-badge");
    const row = page.locator("main .support-link .nav-badge");
    await expect(badge).toHaveText("٢");
    await page.getByRole("button", { name: "فتح التذكرة ١" }).click();
    await expect(badge).toHaveText("١");
    await expect(row).toHaveText("١");
    await page.getByRole("button", { name: "وصل رد" }).click();
    await expect(badge).toHaveText("٢");
    await page.getByRole("button", { name: "فتح التذكرة ٩" }).click();
    await expect(badge).toHaveText("١");
    await page.getByRole("button", { name: "وصل رد" }).click();
    await expect(badge).toHaveText("١");
  });
  test("platform admin: a new ticket notification adds to the team badge", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 850 });
    await page.goto("/e2e/shell?admin=1&waiting=1");
    const badge = page.locator(".sidebar-foot .support-link .nav-badge");
    await expect(badge).toHaveText("١");
    await page.getByRole("button", { name: "وصلت تذكرة" }).click();
    await expect(badge).toHaveText("٢");
  });
});

test.describe("«رجوع» on detail pages", () => {
  test("is large enough to tap on a phone and goes to its page", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/e2e/back");
    const back = page.getByRole("link", { name: "رجوع إلى القائمة" });
    await expect(back).toBeVisible();
    const box = await back.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await back.click();
    await expect(page).toHaveURL(/\/e2e\/back-from\?fallback=1$/);
  });
  test("with history: returns to the previous page inside the platform", async ({ page }) => {
    await page.goto("/e2e/back-from");
    await page.getByRole("link", { name: "افتح التفاصيل" }).click();
    await expect(page).toHaveURL(/\/e2e\/back\?history=1$/);
    await page.getByRole("link", { name: "رجوع إلى القائمة" }).click();
    await expect(page).toHaveURL(/\/e2e\/back-from$/);
  });
  test("with history but opened directly (e.g. from a notification): goes to its page", async ({ page }) => {
    await page.goto("/e2e/back?history=1");
    await page.getByRole("link", { name: "رجوع إلى القائمة" }).click();
    await expect(page).toHaveURL(/\/e2e\/back-from\?fallback=1$/);
  });
});
