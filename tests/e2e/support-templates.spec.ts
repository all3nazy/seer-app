import { expect, test } from "@playwright/test";

test.describe("support replies: links and templates", () => {
  test("the user sees platform links as clickable paths; other addresses stay text", async ({ page }) => {
    await page.goto("/e2e/support-thread");
    const reply = page.locator(".support-messages li.from-team");
    const link = reply.getByRole("link", { name: "https://seersa.vercel.app/dashboard/attendance" });
    await expect(link).toHaveAttribute("href", "/dashboard/attendance");
    await expect(reply.getByRole("link")).toHaveCount(1);
    await expect(reply).toContainText("https://evil.test/dashboard");
    await expect(page.getByLabel("إدراج قالب")).toHaveCount(0);
  });
  test("admin: «إدراج قالب» fills the reply box with the text and the full link, ready to edit", async ({ page }) => {
    await page.goto("/e2e/support-thread?side=admin");
    const pick = page.getByLabel("إدراج قالب");
    await expect(pick.locator("option").nth(1)).toHaveText("⭐ المقترح: تسجيل الحضور");
    await pick.selectOption({ label: "⭐ المقترح: تسجيل الحضور" });
    const box = page.getByLabel("ردّك");
    await expect(box).toHaveValue("من «الحضور»:\n١. اختر الفصل والتاريخ.\n\n🔗 https://seersa.vercel.app/dashboard/attendance");
    await expect(box).toBeFocused();
    await box.fill("تعديلي");
    // Replacing typed text asks first; «إلغاء» keeps it.
    await pick.selectOption({ label: "إضافة موظف أو مستخدم" });
    await page.getByRole("dialog").getByRole("button", { name: "تراجع" }).click();
    await expect(box).toHaveValue("تعديلي");
    await pick.selectOption({ label: "إضافة موظف أو مستخدم" });
    await page.getByRole("dialog").getByRole("button", { name: /^(تأكيد|نعم، متأكد)$/ }).click();
    await expect(box).toHaveValue(/إنشاء رابط انضمام[^]*\n\n🔗 https:\/\/seersa\.vercel\.app\/dashboard\/team$/);
  });
});
