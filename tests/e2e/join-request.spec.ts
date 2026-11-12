import { expect, test } from "@playwright/test";

const rpc = "https://supabase.example.test/rest/v1/rpc/submit_join_request";

test("the join form sends the request, keeps the hidden field empty, and thanks the visitor (phone)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  let body: Record<string, unknown> | null = null;
  await page.route(rpc, async route => { body = route.request().postDataJSON(); await route.fulfill({ json: "ok" }); });
  await page.goto("/e2e/join");
  // The hidden field takes no visible space and cannot be reached with Tab.
  const trap = page.locator(".lp-hp input");
  expect((await trap.boundingBox())?.width ?? 0).toBeLessThanOrEqual(1);
  await expect(trap).toHaveAttribute("tabindex", "-1");
  await page.getByLabel("اسم المنشأة").fill("مدرسة الريادة");
  await page.getByLabel("النوع").selectOption("nursery");
  await page.getByLabel("المدينة").fill("الرياض");
  await page.getByLabel("اسم المسؤول").fill("أبو خالد");
  await page.getByLabel("الجوال").fill("0551112222");
  await page.getByLabel("عدد الطلاب تقريبًا").fill("٢٥٠");
  await page.getByRole("button", { name: "أرسل طلب الانضمام" }).click();
  await expect(page.getByRole("status")).toContainText("وصلنا طلبك");
  expect(body).toEqual({ org_name: "مدرسة الريادة", org_type: "nursery", city: "الرياض", contact_name: "أبو خالد", phone: "0551112222", students: 250, website: "" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("explains a wrong phone and the daily limit", async ({ page }) => {
  let code = "22023";
  await page.route(rpc, route => route.fulfill({ status: 400, json: { code, message: "x" } }));
  await page.goto("/e2e/join");
  for (const [label, value] of [["اسم المنشأة", "مدرسة"], ["المدينة", "جدة"], ["اسم المسؤول", "سارة"], ["الجوال", "123"]]) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "أرسل طلب الانضمام" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("05xxxxxxxx");
  code = "54000";
  await page.getByRole("button", { name: "أرسل طلب الانضمام" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("طلبات كثيرة");
});
