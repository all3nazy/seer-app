import { expect, test, type Page } from "@playwright/test";

const token = "AbCdEfGhJkMnPqRsTuVwXyZa23456789";
const supabase = "https://supabase.example.test";

/** Stand-ins for the database calls the page makes; records every request it sends. */
async function mock(page: Page, view: unknown, accept: unknown = { ok: true, login: "nukhba.admin@users.seer.local", organization_id: "11111111-1111-1111-1111-111111111111" }) {
  const calls: { url: string; body: string }[] = [];
  page.on("request", request => calls.push({ url: request.url(), body: request.postData() ?? "" }));
  await page.route(`${supabase}/rest/v1/rpc/org_invite_view`, route => route.fulfill({ json: view }));
  await page.route(`${supabase}/rest/v1/rpc/accept_org_invite`, route => route.fulfill({ json: accept }));
  await page.route(`${supabase}/auth/v1/token**`, route => route.fulfill({ status: 400, json: { error: "invalid_grant" } }));
  return calls;
}

test("without a token the page says the link is not valid", async ({ page }) => {
  await page.goto("/invite");
  await expect(page.getByRole("heading", { level: 1, name: "الرابط غير صالح" })).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toContainText("الرابط غير صحيح");
});

test("a used or expired link explains what to do", async ({ page }) => {
  await mock(page, { valid: false, reason: "expired" });
  await page.goto(`/invite#${token}`);
  await expect(page.locator("main").getByRole("alert")).toContainText("انتهت صلاحية الرابط");
});

test("the owner sees the organization, must accept the terms, and the token is never sent in an address", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await mock(page, { valid: true, organization: "مدرسة النخبة", type: "school", trial_months: 3, plan: "المتقدمة" });
  await page.goto(`/invite#${token}`);
  await expect(page.getByRole("heading", { level: 1, name: "أهلًا بكم في سِير" })).toBeVisible();
  await expect(page.getByText("مدرسة النخبة")).toBeVisible();
  await expect(page.getByText("٣ أشهر", { exact: false })).toBeVisible();
  const submit = page.getByRole("button", { name: "فعّل المنشأة وادخل" });
  await page.getByLabel("اسمك").fill("أبو فهد");
  await page.getByLabel("اسم المستخدم (أو بريدك)").fill("nukhba.admin");
  await page.getByLabel("كلمة المرور").fill("secret123");
  await expect(submit).toBeDisabled();
  await expect(page.getByRole("link", { name: "شروط الاستخدام" }).first()).toHaveAttribute("href", "/terms");
  await page.getByRole("checkbox").check();
  await expect(submit).toBeEnabled();
  await submit.click();
  // The account was created: sign-in is attempted (refused by the stand-in), then the login page opens.
  await expect(page).toHaveURL(/\/login\?activated=1$/);
  const accept = calls.find(call => call.url.endsWith("/rpc/accept_org_invite"));
  expect(JSON.parse(accept!.body)).toMatchObject({ token, login: "nukhba.admin", password: "secret123", name: "أبو فهد", legal_version: expect.stringMatching(/^[0-9A-Za-z.-]+$/) });
  // The token travels only in request bodies, never in any address the browser requested.
  expect(calls.filter(call => call.url.includes(token))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a refused link after submitting shows the reason instead of the form", async ({ page }) => {
  await mock(page, { valid: true, organization: "مدرسة النخبة", type: "school", trial_months: 3, plan: "المتقدمة" }, { ok: false, reason: "used" });
  await page.goto(`/invite#${token}`);
  await page.getByLabel("اسمك").fill("أبو فهد");
  await page.getByLabel("اسم المستخدم (أو بريدك)").fill("nukhba.admin");
  await page.getByLabel("كلمة المرور").fill("secret123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "فعّل المنشأة وادخل" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("استُخدم من قبل");
});
