import { expect, test, type Page } from "@playwright/test";

/** The visible tab and panel; exactly one panel shows. */
async function expectTab(page: Page, label: string) {
  await expect(page.getByRole("tab", { selected: true })).toHaveText(label);
  await expect(page.locator("[role=tabpanel]:visible")).toHaveCount(1);
  await expect(page.getByRole("tabpanel", { name: label })).toBeVisible();
}

// Every tab, the old anchors from before the tabs, and short names (the #org bug).
const owner: [string, string][] = [
  ["", "حسابي"], ["account", "حسابي"], ["me", "حسابي"], ["password", "حسابي"],
  ["organization", "المنشأة"], ["org", "المنشأة"], ["sections", "المنشأة"], ["team", "المنشأة"],
  ["device", "الجهاز والإشعارات"], ["notify", "الجهاز والإشعارات"], ["app", "الجهاز والإشعارات"], ["general", "الجهاز والإشعارات"],
  ["help", "المساعدة"], ["support", "المساعدة"], ["no-such-tab", "حسابي"],
];
for (const [hash, label] of owner) {
  test(`owner: /settings#${hash || "(none)"} opens «${label}»`, async ({ page }) => {
    await page.goto(`/e2e/settings-tabs${hash ? `#${hash}` : ""}`);
    await expectTab(page, label);
  });
}

test("staff have no organization tab; its links fall back to the first tab", async ({ page }) => {
  await page.goto("/e2e/settings-tabs?role=staff#org");
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expectTab(page, "حسابي");
});

test("clicking a tab updates the address; following a link to another hash switches tabs", async ({ page }) => {
  await page.goto("/e2e/settings-tabs");
  await page.getByRole("tab", { name: "المساعدة" }).click();
  await expectTab(page, "المساعدة");
  expect(new URL(page.url()).hash).toBe("#help");
  await page.evaluate(() => { location.hash = "org"; });
  await expectTab(page, "المنشأة");
});

test("arrow keys move between tabs (right-to-left)", async ({ page }) => {
  await page.goto("/e2e/settings-tabs");
  await page.getByRole("tab", { name: "حسابي" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expectTab(page, "المنشأة");
  await expect(page.getByRole("tab", { name: "المنشأة" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expectTab(page, "حسابي");
});
