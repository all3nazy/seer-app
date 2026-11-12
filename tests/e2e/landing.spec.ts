import { expect, test } from "@playwright/test";

for (const [device, viewport] of [["phone", { width: 375, height: 812 }], ["computer", { width: 1366, height: 900 }]] as const) {
  test(`home page on a ${device}: every section in order, readable, no sideways scrolling`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "يوم المدرسة كله… من جوالك" })).toBeVisible();
    await expect(page.getByText("حيّاكم في سِير")).toBeVisible();
    await expect(page.getByText("تجربة مجانية كاملة بكل المزايا · بدون أي رسوم")).toBeVisible();
    const headings = await page.locator("main h2").allTextContents();
    expect(headings.slice(0, 4)).toEqual(["وش تلقون في سِير", "شوف سِير من الداخل", "ثلاث خطوات وتبدأون", "بياناتكم في أمان"]);
    await expect(page.locator(".lp-feature")).toHaveCount(6);
    await expect(page.locator(".lp-phone")).toHaveCount(3);
    await expect(page.locator(".lp-steps li")).toHaveCount(3);
    // Drawn with HTML and CSS: no images on the page.
    await expect(page.locator("main img")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Sign-in is in the top bar and the main card.
    await expect(page.locator(".lp-top").getByRole("link", { name: "تسجيل الدخول" })).toHaveAttribute("href", "/login");
    await expect(page.getByRole("link", { name: "عندي دعوة، سجّل دخولي" })).toHaveAttribute("href", "/login");
    // Footer: privacy, terms, email.
    const footer = page.locator("footer");
    await expect(footer.getByRole("link", { name: "سياسة الخصوصية" })).toHaveAttribute("href", "/privacy");
    await expect(footer.getByRole("link", { name: "شروط الاستخدام" })).toHaveAttribute("href", "/terms");
    await expect(footer.getByRole("link", { name: "seer-app@smail.sa" })).toHaveAttribute("href", "mailto:seer-app@smail.sa");
    await page.screenshot({ path: test.info().outputPath(`home-${device}.png`), fullPage: true });
  });
}

test("outside the pilot: «ابدأ تجربتك» goes to sign-up and the prices link shows", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "ابدأ تجربتك" })).toHaveAttribute("href", "/signup");
  await expect(page.locator(".lp-top").getByRole("link", { name: "الأسعار" })).toHaveAttribute("href", "/pricing");
  await expect(page.getByRole("link", { name: "أبي أنضم للتجربة" })).toHaveCount(0);
});

test("the contact section has a ready email, and the page works in dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/#join");
  const mail = page.locator("#join").getByRole("link", { name: "راسلنا على البريد" });
  const href = await mail.getAttribute("href");
  expect(href).toMatch(/^mailto:seer-app@smail\.sa\?subject=/);
  expect(decodeURIComponent(new URL(href!).searchParams.get("subject") ?? "")).toBe("طلب انضمام لتجربة سِير");
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).not.toBe("rgb(255, 255, 255)");
});

test("a signed-in person sees «ادخل لوحتك»", async ({ page, context }) => {
  await context.addCookies([{ name: "sb-example-auth-token", value: "x", url: "http://127.0.0.1:3100" }]);
  await page.goto("/");
  await expect(page.locator(".lp-top").getByRole("link", { name: "ادخل لوحتك" })).toHaveAttribute("href", "/dashboard");
  await expect(page.locator(".lp-hero").getByRole("link", { name: "ادخل لوحتك" })).toBeVisible();
});

test("link previews: title, description and the Open Graph image", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("سِير — يوم المدرسة كله… من جوالك");
  expect(await page.locator('meta[property="og:description"]').getAttribute("content")).toContain("منصة سعودية");
  const image = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(image).toContain("/opengraph-image");
  const response = await request.get(new URL(image!).pathname);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  expect((await response.body()).length).toBeGreaterThan(10_000);
});
