import { expect, test, type Page } from "@playwright/test";

const devices = [{ name: "computer", width: 1440, height: 900 }, { name: "iPad", width: 820, height: 1180 }, { name: "phone", width: 390, height: 844 }];
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

for (const device of devices) {
  test.describe(`«سِير أدمن» stage 2 on a ${device.name}`, () => {
    test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: device.width, height: device.height }); });

    test("overview: decision cards link to their pages, numbers, transfers with confirm/reject, health, activity", async ({ page }) => {
      await page.goto("/e2e/admin-overview");
      await expect(page.getByRole("heading", { level: 1, name: "نظرة عامة" })).toBeVisible();
      const decisions = page.getByRole("region", { name: "يحتاج قرارك الحين" });
      await expect(decisions.getByRole("link", { name: /تحويلات بانتظار التأكيد/ })).toHaveAttribute("href", "/admin/payments");
      await expect(decisions.getByRole("link", { name: /تحويلات بانتظار التأكيد/ })).toContainText("أقدمها قبل يومين — روضة الياسمين");
      await expect(decisions.getByRole("link", { name: /تذاكر دعم بلا رد/ })).toContainText("١ منها أكثر من ٢٤ ساعة");
      await expect(decisions.getByRole("link", { name: /اشتراكات تنتهي/ })).toHaveAttribute("href", "/admin/subscribers?ending=1");
      const numbers = page.getByRole("region", { name: "أرقام المنصة" });
      await expect(numbers).toContainText("٤١");
      await expect(numbers).toContainText("٩٢٪");
      await expect(numbers).toContainText("من ٥٢٠ حساب");
      const transfers = page.getByRole("region", { name: "تحويلات بانتظار التأكيد" });
      await expect(transfers.getByRole("button", { name: "اعتماد" })).toHaveCount(2);
      await transfers.getByRole("button", { name: "رفض" }).first().click();
      await expect(transfers.getByPlaceholder("سبب الرفض (يوصل للمشترك)")).toBeVisible();
      const health = page.getByRole("region", { name: "صحة المنصة" });
      await expect(health).toContainText("٢ من ٢ شغالة");
      await expect(health).toContainText("قريبًا");
      await expect(page.getByRole("region", { name: "آخر ما صار في المنصة" }).getByRole("listitem")).toHaveCount(3);
      await noSideScroll(page);
    });

    test("overview with nothing pending: Arabic empty states", async ({ page }) => {
      await page.goto("/e2e/admin-overview?empty=1");
      await expect(page.getByText("ما فيه تحويلات بانتظار التأكيد.")).toBeVisible();
      await expect(page.getByText("ما صار شي بعد.")).toBeVisible();
      await expect(page.getByRole("link", { name: /طلبات انضمام جديدة/ })).toContainText("ما فيه طلبات جديدة");
    });

    test("organization profile: header with pills and actions, tabs by hash, users, sections, setup, support, log", async ({ page }) => {
      await page.goto("/e2e/admin-org");
      await expect(page.getByRole("heading", { level: 1, name: "روضة الياسمين" })).toBeVisible();
      await expect(page.getByText("روضة · الرياض · مشتركة من ٣ أكتوبر ٢٠٢٦")).toBeVisible();
      await expect(page.locator(".adm-pills")).toContainText("نشط");
      await expect(page.locator(".adm-pills")).toContainText("المتقدمة");
      // Header actions open their forms; cancel asks for a reason and confirms in the app's dialog.
      await page.getByRole("button", { name: "تمديد الاشتراك" }).click();
      await expect(page.getByRole("spinbutton", { name: "المدة" })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "الوحدة" })).toHaveValue("months");
      await page.getByRole("button", { name: "إلغاء الاشتراك" }).click();
      const reason = page.getByLabel("سبب الإلغاء (يوصل للمالك)");
      await expect(reason).toBeVisible();
      await expect(page.getByRole("button", { name: "تأكيد الإلغاء" })).toBeDisabled();
      await reason.fill("طلب المالك");
      await page.getByRole("button", { name: "تأكيد الإلغاء" }).click();
      await expect(page.getByRole("dialog")).toContainText("إلغاء الاشتراك؟");
      await page.getByRole("dialog").getByRole("button", { name: "تراجع" }).click();
      // Tabs.
      const tabs = page.getByRole("tablist", { name: "أقسام ملف المنشأة" });
      await expect(tabs.getByRole("tab")).toHaveText(["نظرة", "الاشتراك والفواتير", "المستخدمين", "الأقسام المفعّلة", "التأسيس", "الدعم", "السجل"]);
      await expect(page.getByRole("region", { name: "التأسيس" })).toContainText("واقف عند «الفصول» من ٤ أيام");
      await expect(page.getByLabel("تظهر لك ولفريق الإدارة فقط")).toHaveValue("تواصلنا معهم في معرض الرياض.");
      await tabs.getByRole("tab", { name: "المستخدمين" }).click();
      await expect(page).toHaveURL(/#users$/);
      const users = page.getByRole("tabpanel", { name: "المستخدمين" });
      await expect(users.locator("tbody tr")).toHaveCount(3);
      await expect(users.getByRole("row", { name: /هدى/ })).toContainText("مقفل مؤقتًا");
      await expect(users.getByRole("row", { name: /هدى/ }).getByRole("button", { name: "فك قفل الدخول" })).toBeVisible();
      await expect(users.getByRole("row", { name: /نورة/ }).getByRole("button", { name: "نقل الملكية له" })).toHaveCount(0);
      await tabs.getByRole("tab", { name: "الأقسام المفعّلة" }).click();
      const blocked = page.getByRole("switch", { name: /الدفع الإلكتروني: ممنوع/ });
      await expect(blocked).not.toBeChecked();
      await expect(page.getByRole("button", { name: "حفظ الأقسام المتاحة" })).toBeDisabled();
      await blocked.check();
      await expect(page.getByRole("button", { name: "حفظ الأقسام المتاحة" })).toBeEnabled();
      await tabs.getByRole("tab", { name: "الاشتراك والفواتير" }).click();
      await expect(page.getByRole("tabpanel", { name: "الاشتراك والفواتير" }).getByRole("link", { name: /فتح/ })).toHaveAttribute("href", "#receipt");
      await tabs.getByRole("tab", { name: "السجل" }).click();
      await expect(page.getByRole("tabpanel", { name: "السجل" })).toContainText("تمديد الاشتراك");
      // Keyboard: arrows move between tabs.
      await page.getByRole("tab", { name: "السجل" }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("tab", { name: "الدعم" })).toBeFocused();
      await noSideScroll(page);
    });

    test("subscribers list: search and filters, Arabic pages that keep the filters", async ({ page }) => {
      await page.goto("/e2e/admin-subscribers");
      await expect(page.getByRole("heading", { level: 1, name: "المنشآت" })).toBeVisible();
      await expect(page.getByText("٦٠ منشأة مطابقة")).toBeVisible();
      const form = page.getByRole("search", { name: "بحث وتصفية المنشآت" });
      await expect(form.getByRole("searchbox", { name: "بحث" })).toHaveValue("الرياض");
      await expect(form.getByRole("combobox", { name: "الحالة" })).toBeVisible();
      await expect(form.getByRole("combobox", { name: "الباقة" })).toBeVisible();
      await expect(form.getByRole("combobox", { name: "الترتيب" })).toBeVisible();
      const pager = page.getByRole("navigation", { name: "صفحات المنشآت" });
      await expect(pager.getByRole("link", { name: "الصفحة ٢" })).toHaveAttribute("aria-current", "page");
      await expect(pager.getByRole("link", { name: "الصفحة ٣" })).toHaveAttribute("href", /q=%D8%A7%D9%84%D8%B1%D9%8A%D8%A7%D8%B6.*page=3/);
      await expect(pager.getByRole("link", { name: "السابقة" })).toHaveAttribute("href", /q=/);
      await expect(page.getByRole("row", { name: /روضة الياسمين/ })).toContainText("تحويل معلّق");
      await noSideScroll(page);
    });

    test("subscribers list with no match: Arabic empty state", async ({ page }) => {
      await page.goto("/e2e/admin-subscribers?none=1");
      await expect(page.getByText("ما لقيت منشآت بهالبحث. جرّب كلمة ثانية أو امسح التصفية.")).toBeVisible();
      await expect(page.getByRole("navigation", { name: "صفحات المنشآت" })).toHaveCount(0);
    });
  });
}
