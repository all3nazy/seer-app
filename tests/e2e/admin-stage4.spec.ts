import { expect, test, type Page } from "@playwright/test";

const devices = [{ name: "computer", width: 1440, height: 900 }, { name: "iPad", width: 820, height: 1180 }, { name: "phone", width: 390, height: 844 }];
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

// Every admin page with sample data, for the final pass on each device.
const allPages = [
  "/e2e/admin-overview", "/e2e/admin-org", "/e2e/admin-subscribers", "/e2e/admin-shell",
  ...["", "coupons", "invoices", "invoice", "org-invoices", "broadcast", "security", "audit", "team", "no-access"].map(view => `/e2e/admin-stage3${view ? `?view=${view}` : ""}`),
  "/e2e/admin-stage4", "/e2e/admin-stage4?view=health", ...["dashboard", "students", "attendance", "finance", "staff", "settings"].map(section => `/e2e/admin-stage4?view=view&section=${section}`),
];

for (const device of devices) {
  test.describe(`«سِير أدمن» stage 4 on a ${device.name}`, () => {
    test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: device.width, height: device.height }); });

    test("backups: last good backup, the list with status/size/rows, «نسخة الحين» asks first, download per file", async ({ page }) => {
      await page.goto("/e2e/admin-stage4");
      await expect(page.getByRole("heading", { level: 1, name: "النسخ الاحتياطي" })).toBeVisible();
      await expect(page.getByRole("region", { name: "آخر نسخة ناجحة" })).toContainText("٤٨٬٢١٠ صف في ١١٢ ملف");
      const list = page.getByRole("region", { name: /النسخ \(/ });
      await expect(list.locator("tbody tr")).toHaveCount(2);
      await expect(list).toContainText("فشلت");
      await expect(list).toContainText("upload public.children.json.gz: timeout");
      await expect(list).toContainText("٢٫٣ م.ب");
      await expect(list.getByLabel("الملف").locator("option")).toHaveText(["manifest.json", "public.children.json.gz", "auth.users.json.gz"]);
      await expect(list.getByRole("button", { name: /تحميل/ })).toHaveCount(1);
      await page.getByRole("button", { name: "نسخة الحين" }).click();
      await expect(page.getByRole("dialog")).toContainText("أخذ نسخة احتياطية كاملة الحين؟");
      await page.getByRole("dialog").getByRole("button", { name: "تراجع" }).click();
      await page.goto("/e2e/admin-stage4?empty=1");
      await expect(page.getByRole("alert", { name: "آخر نسخة ناجحة" })).toContainText("ما فيه نسخة ناجحة بعد.");
      await noSideScroll(page);
    });

    test("health: database, backup, pg_cron jobs with results, queues with the oldest item, errors with actions", async ({ page }) => {
      await page.goto("/e2e/admin-stage4?view=health");
      await expect(page.getByRole("heading", { level: 1, name: "صحة النظام" })).toBeVisible();
      await expect(page.getByRole("link", { name: "لوحة Supabase" })).toHaveAttribute("href", "https://supabase.com/dashboard/project/vhcdzonkgalpcozbhmmj");
      await expect(page.getByRole("region", { name: "الموقع وقاعدة البيانات" })).toContainText("تستجيب");
      const cron = page.getByRole("region", { name: /المهام التلقائية/ });
      await expect(cron).toContainText("تذكيرات الاشتراك اليومية");
      await expect(cron).toContainText("نجحت");
      await expect(cron).toContainText("٤ فشل آخر ٢٤ ساعة");
      await expect(cron).toContainText("connection refused");
      const queues = page.getByRole("region", { name: "الطوابير" });
      await expect(queues).toContainText("٢ بالانتظار · أقدمها ١ ساعة · ١ فشل");
      await expect(queues.locator(".adm-dot-state.bad")).toHaveCount(1);
      const errors = page.getByRole("region", { name: "آخر الأخطاء" });
      await expect(errors).toContainText("تعذر حفظ الحضور");
      await expect(errors.getByRole("button", { name: "تم حلّه" })).toBeVisible();
      await noSideScroll(page);
    });

    test("read-only view: the banner, the owner's sections, no forms or buttons that write", async ({ page }) => {
      await page.goto("/e2e/admin-stage4?view=view");
      await expect(page.getByRole("status").filter({ hasText: "وضع المشاهدة — للقراءة فقط." })).toBeVisible();
      const tabs = page.getByRole("navigation", { name: "صفحات المنشأة" });
      await expect(tabs.getByRole("link")).toHaveText(["الرئيسية", "الطلاب والأطفال", "الحضور", "المالية", "الفريق", "الإعدادات"]);
      await expect(tabs.getByRole("link", { name: "الرئيسية" })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("region", { name: "صفحات ما تنعرض هنا بعد" })).toContainText("الرواتب والإجازات");
      for (const [section, text] of [["students", "جود"], ["attendance", "حاضر"], ["finance", "المتبقي"], ["staff", "المديرة"], ["settings", "النقل"]]) {
        await page.goto(`/e2e/admin-stage4?view=view&section=${section}`);
        await expect(page.locator("main")).toContainText(text);
        await expect(page.locator("main form")).toHaveCount(0);
        await expect(page.locator("main button")).toHaveCount(0);
      }
      await noSideScroll(page);
    });

    test("final pass: every admin page has a heading, no «قريبًا», and no sideways scroll", async ({ page }) => {
      for (const path of allPages) {
        await page.goto(path);
        await expect(page.locator("main :is(h1, h2)").first(), path).toBeVisible();
        expect((await page.locator("body").innerText()).replace(/تنتهي قريبًا/g, ""), path).not.toContain("قريبًا");
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), path).toBeLessThanOrEqual(1);
      }
    });
  });
}
