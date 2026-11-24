import { expect, test, type Page } from "@playwright/test";

const devices = [{ name: "computer", width: 1440, height: 900 }, { name: "iPad", width: 820, height: 1180 }, { name: "phone", width: 390, height: 844 }];
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
const sidebar = async (page: Page) => {
  const menu = page.getByRole("button", { name: "القائمة" });
  if (await menu.isVisible()) await menu.click();
  return page.getByRole("navigation", { name: "أقسام لوحة المالك" });
};

for (const device of devices) {
  test.describe(`«سِير أدمن» stage 3 on a ${device.name}`, () => {
    test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: device.width, height: device.height }); });

    test("sidebar: the new pages in their groups for the owner; support and finance see only theirs", async ({ page }) => {
      await page.goto("/e2e/admin-stage3");
      let nav = await sidebar(page);
      for (const name of ["الكوبونات والعروض", "الفواتير والإيصالات", "رسالة للمشتركين", "فريق الإدارة", "أمان الدخول", "سجل العمليات"]) await expect(nav.getByRole("link", { name })).toBeVisible();
      await expect(nav.getByRole("link", { name: "أمان الدخول" })).toHaveAttribute("href", "/admin/security");
      await expect(nav.getByRole("link", { name: "سجل العمليات" })).toHaveAttribute("href", "/admin/audit");
      await page.goto("/e2e/admin-stage3?role=support");
      nav = await sidebar(page);
      await expect(nav.getByRole("link")).toHaveText(["نظرة عامة", "المنشآت", "صندوق الوارد", "تذاكر الدعم", /قوالب الردود/].map(text => typeof text === "string" ? new RegExp(text) : text));
      await expect(page.locator(".adm-sub")).toHaveText("فريق الإدارة · دعم");
      // The overview hides the transfers for support.
      await expect(page.getByRole("region", { name: "تحويلات بانتظار التأكيد" })).toHaveCount(0);
      await page.goto("/e2e/admin-stage3?role=finance");
      nav = await sidebar(page);
      await expect(nav.getByRole("link", { name: "الكوبونات والعروض" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "تذاكر الدعم" })).toHaveCount(0);
      await expect(nav.getByRole("link", { name: "فريق الإدارة" })).toHaveCount(0);
      await page.goto("/e2e/admin-stage3?view=no-access&role=finance");
      await expect(page.getByRole("main").getByRole("alert")).toContainText("دورك في فريق الإدارة «مالية»");
      await noSideScroll(page);
    });

    test("coupons: the form, the list with state and use, edit and the use log", async ({ page }) => {
      await page.goto("/e2e/admin-stage3?view=coupons&coupon=c3000000-0000-0000-0000-000000000001");
      await expect(page.getByRole("heading", { level: 1, name: "الكوبونات والعروض" })).toBeVisible();
      const form = page.getByRole("form", { name: "كوبون جديد" });
      await expect(form.getByLabel("الكود")).toBeVisible();
      await form.getByLabel("نوع الخصم").selectOption("fixed");
      await expect(form.getByLabel("المبلغ (ر.س)")).toBeVisible();
      await expect(form.getByRole("group", { name: /الباقات/ }).getByRole("checkbox")).toHaveCount(2);
      await expect(form.getByRole("group", { name: /المدد/ }).getByRole("checkbox")).toHaveCount(4);
      const list = page.getByRole("region", { name: /الكوبونات \(/ });
      const first = list.getByRole("listitem").filter({ hasText: "RAMADAN20" });
      await expect(first).toContainText("خصم ٢٠٪");
      await expect(first).toContainText("فعّال");
      await expect(first).toContainText("كل الباقات · سنة · كل تجديد");
      await expect(first).toContainText("استُخدم ٣ من ٥٠ · ١ بانتظار التأكيد");
      await expect(list.getByRole("listitem").filter({ hasText: "FIRST100" })).toContainText("موقوف");
      await first.getByRole("button", { name: "تعديل RAMADAN20" }).click();
      await expect(page.getByRole("form", { name: "تعديل الكوبون RAMADAN20" }).getByLabel("الكود")).toHaveValue("RAMADAN20");
      const uses = page.getByRole("region", { name: /استخدام الكوبون/ });
      await expect(uses).toContainText("روضة الياسمين");
      await expect(uses).toContainText("SEER-2026-00012");
      await noSideScroll(page);
    });

    test("invoices: list, the printable receipt with operator details and no VAT, and «إصدار فاتورة» with confirmation", async ({ page }) => {
      await page.goto("/e2e/admin-stage3?view=invoices");
      await expect(page.getByRole("heading", { level: 1, name: "الفواتير والإيصالات" })).toBeVisible();
      await expect(page.getByRole("link", { name: "SEER-2026-00012" })).toHaveAttribute("href", "/admin/invoices/c5000000-0000-0000-0000-000000000002");
      await expect(page.getByText("كوبون RAMADAN20 · خصم")).toBeVisible();
      await page.goto("/e2e/admin-stage3?view=invoice");
      const doc = page.getByRole("article");
      await expect(doc.getByRole("heading", { level: 1, name: "إيصال اشتراك" })).toBeVisible();
      await expect(doc).toContainText("SEER-2026-00012");
      await expect(doc.getByRole("region", { name: "مقدّم الخدمة" })).toContainText("متعب العنزي");
      await expect(doc.getByRole("region", { name: "العميل" })).toContainText("روضة الياسمين");
      await expect(doc).toContainText("خصم بالكوبون RAMADAN20");
      await expect(doc).toContainText("لا تشمل ضريبة القيمة المضافة");
      await expect(doc.getByRole("button", { name: /طباعة/ })).toBeVisible();
      await page.goto("/e2e/admin-stage3?view=org-invoices");
      await page.getByRole("button", { name: "إصدار فاتورة" }).click();
      const issue = page.getByRole("form", { name: "إصدار فاتورة" });
      await issue.getByLabel("الوصف").fill("تسوية فرق الترقية");
      await issue.getByLabel("المبلغ (ر.س)").fill("150");
      await issue.getByRole("button", { name: "إصدار" }).click();
      await expect(page.getByRole("dialog")).toContainText("إصدار فاتورة بمبلغ ١٥٠ ر.س");
      await page.getByRole("dialog").getByRole("button", { name: "تراجع" }).click();
      await noSideScroll(page);
    });

    test("broadcast: compose, audience, channels; sending needs a fresh count; history with counts", async ({ page }) => {
      await page.goto("/e2e/admin-stage3?view=broadcast");
      await expect(page.getByRole("heading", { level: 1, name: "رسالة للمشتركين" })).toBeVisible();
      const form = page.getByRole("form", { name: "رسالة جديدة" });
      await form.getByLabel("العنوان").fill("تحديث جديد");
      await form.getByLabel("النص").fill("أضفنا تقارير جديدة.");
      await expect(form.getByRole("button", { name: "إرسال" })).toBeDisabled();
      await expect(form.getByRole("status")).toHaveText("احسب عدد المستلمين قبل الإرسال.");
      await form.getByLabel("الحالة").selectOption("trial");
      await form.getByLabel("منشآت مختارة فقط").check();
      await form.getByLabel("بحث في المنشآت").fill("النخيل");
      await expect(form.getByRole("group", { name: /اختر المنشآت/ }).getByRole("checkbox")).toHaveCount(1);
      await form.getByRole("checkbox", { name: "مدارس النخيل" }).check();
      await expect(form.getByRole("group", { name: "اختر المنشآت (١)" })).toBeVisible();
      await expect(form.getByLabel("بريد للملاك اللي عندهم بريد حقيقي")).toBeChecked();
      const history = page.getByRole("region", { name: "الرسائل السابقة" });
      await expect(history).toContainText("صيانة مجدولة");
      await expect(history).toContainText("كل المشتركين · الملاك والمدراء");
      await expect(history).toContainText("٦٣ إشعار · ٣٨ بريد");
      await noSideScroll(page);
    });

    test("security: numbers, locks with «فك القفل», failing IPs with a block link, the block list and its form", async ({ page }) => {
      await page.goto("/e2e/admin-stage3?view=security");
      await expect(page.getByRole("heading", { level: 1, name: "أمان الدخول" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "المدة" }).getByRole("link", { name: "٢٤ ساعة" })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("region", { name: /أرقام آخر ٢٤ ساعة/ })).toContainText("٤١٢");
      const locks = page.getByRole("region", { name: /الأقفال/ });
      await expect(locks.getByRole("button", { name: "فك القفل la***@nakheel.test" })).toBeVisible();
      await expect(locks.getByRole("button", { name: /فك القفل/ })).toHaveCount(1);
      const ips = page.getByRole("region", { name: "أكثر العناوين فشلًا" });
      await expect(ips.getByRole("link", { name: "حظر 203.0.113.9" })).toHaveAttribute("href", "/admin/security?block=203.0.113.9#block");
      await expect(ips).toContainText("محظور");
      const blocks = page.getByRole("region", { name: "قائمة الحظر" });
      await expect(blocks).toContainText("198.51.100.0/24");
      await expect(blocks).toContainText("شبكة مزعجة");
      await expect(blocks.getByRole("button", { name: "رفع الحظر 198.51.100.0/24" })).toBeVisible();
      await page.goto("/e2e/admin-stage3?view=security&block=203.0.113.9");
      const form = page.getByRole("form", { name: "حظر عنوان IP" });
      await expect(form.getByLabel("العنوان أو النطاق")).toHaveValue("203.0.113.9");
      await expect(form.getByRole("button", { name: "حظر" })).toBeDisabled();
      await form.getByLabel("السبب").fill("تخمين كلمات مرور");
      await form.getByRole("button", { name: "حظر" }).click();
      await expect(page.getByRole("dialog")).toContainText("حظر 203.0.113.9 من تسجيل الدخول لمدة ٧ يوم");
      await page.getByRole("dialog").getByRole("button", { name: "تراجع" }).click();
      await noSideScroll(page);
    });

    test("operations log: filters, Arabic labels, details, CSV export link", async ({ page }) => {
      await page.goto("/e2e/admin-stage3?view=audit");
      await expect(page.getByRole("heading", { level: 1, name: "سجل العمليات" })).toBeVisible();
      const filters = page.getByRole("search", { name: "تصفية السجل" });
      await expect(filters.getByLabel("العملية").locator("option")).toHaveText(["كل العمليات", "إضافة كوبون", "تمديد الاشتراك"]);
      await expect(filters.getByLabel("من تاريخ")).toBeVisible();
      await expect(page.getByRole("link", { name: "تصدير CSV" })).toHaveAttribute("href", "/admin/audit/export");
      await expect(page.locator("tbody tr")).toHaveCount(2);
      await expect(page.locator("tbody")).toContainText("إضافة كوبون");
      await expect(page.locator("tbody")).toContainText("code: RAMADAN20 · value: 20");
      await expect(page.getByRole("link", { name: "روضة الياسمين" })).toHaveAttribute("href", "/admin/subscribers/d2000000-0000-0000-0000-0000000000d1");
      await noSideScroll(page);
    });

    test("team: roles explained, invite form, members with role, two-step state and actions (not on yourself)", async ({ page }) => {
      await page.goto("/e2e/admin-stage3?view=team");
      await expect(page.getByRole("heading", { level: 1, name: "فريق الإدارة" })).toBeVisible();
      const invite = page.getByRole("form", { name: "إضافة عضو للفريق" });
      await invite.getByLabel("الدور").selectOption("finance");
      await expect(invite).toContainText("التحويلات والفواتير والكوبونات");
      await invite.getByLabel("البريد (حساب موجود في سِير)").fill("money@seer.test");
      await invite.getByRole("button", { name: "إضافة للفريق" }).click();
      await expect(page.getByRole("dialog")).toContainText("إضافة money@seer.test لفريق الإدارة بدور «مالية»؟");
      await page.getByRole("dialog").getByRole("button", { name: "تراجع" }).click();
      const list = page.getByRole("region", { name: /الفريق \(/ });
      await expect(list.locator("tbody tr")).toHaveCount(2);
      await expect(list.locator("tbody tr").first()).toContainText("أنت");
      await expect(list.getByLabel("دور help@seer.test")).toHaveValue("support");
      await expect(list.getByRole("button", { name: "إزالة help@seer.test" })).toBeVisible();
      await expect(list).toContainText("يُطلب عند أول دخول");
      await noSideScroll(page);
    });
  });
}
