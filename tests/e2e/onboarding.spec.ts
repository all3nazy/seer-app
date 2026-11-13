import { expect, test, type Page } from "@playwright/test";

type Step = { step: string; done: boolean; markable: boolean };
const orgKeys = ["profile", "device", "sections", "classes", "students", "guardians", "team", "attendance", "daily", "portal"];
const markable = new Set(["device", "sections"]);

/** Answers the guide's database calls like onboarding_status / start / mark / snooze would. */
async function fakeDatabase(page: Page, options: { done?: number; welcome?: boolean; track?: "org" | "staff" } = {}) {
  const keys = options.track === "staff" ? ["profile", "device", "attendance", "daily", "my", "support"] : orgKeys;
  const state = {
    track: options.track ?? "org",
    steps: keys.map((step, index) => ({ step, done: index < (options.done ?? 0), markable: options.track === "staff" ? step !== "profile" : markable.has(step) })) as Step[],
    started: !options.welcome, snooze_count: 0, calls: [] as string[],
  };
  const status = () => {
    const done = state.steps.filter(step => step.done).length;
    return { track: state.track, steps: state.steps, done, total: state.steps.length, complete: done === state.steps.length, started: state.started, snoozed_until: state.snooze_count ? new Date(Date.now() + 12 * 3600_000).toISOString() : null, snooze_count: state.snooze_count, show_welcome: !state.started && !state.snooze_count };
  };
  await page.route("https://supabase.example.test/**", async route => {
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "content-type": "application/json" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const name = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    const body = route.request().postDataJSON() as { step?: string } | null;
    state.calls.push(name);
    if (name === "onboarding_start") state.started = true;
    if (name === "onboarding_snooze") state.snooze_count++;
    if (name === "onboarding_mark" && body?.step) state.steps = state.steps.map(step => step.step === body.step ? { ...step, done: true } : step);
    if (name.startsWith("onboarding_")) return route.fulfill({ status: 200, headers, body: JSON.stringify(status()) });
    return route.fulfill({ status: 200, headers, body: "null" });
  });
  return {
    state,
    /** A step done from the data (e.g. the first student was saved); the page asks again when it comes back into view. */
    async finish(step: string) {
      state.steps = state.steps.map(item => item.step === step ? { ...item, done: true } : item);
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    },
  };
}

/** The highlight surrounds the element. */
async function expectRingAround(page: Page, selector: string) {
  const ring = page.locator(".onb-ring");
  await expect(ring).toBeVisible();
  await expect.poll(async () => {
    const [a, b] = [await ring.boundingBox(), await page.locator(selector).first().boundingBox()];
    return Boolean(a && b && a.x <= b.x && a.y <= b.y && a.x + a.width >= b.x + b.width && a.y + a.height >= b.y + b.height);
  }).toBe(true);
}

for (const device of [{ name: "computer", width: 1366, height: 850 }, { name: "phone", width: 390, height: 844 }]) {
  test.describe(`guided setup on a ${device.name}`, () => {
    test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: device.width, height: device.height }); });

    test("first visit: the welcome lists the steps; «ابدأ» opens the first step with its button highlighted", async ({ page }) => {
      const db = await fakeDatabase(page, { welcome: true });
      await page.goto("/e2e/onboarding/home?welcome=1");
      const welcome = page.getByRole("dialog", { name: "خلونا نجهّز روضتكم" });
      await expect(welcome).toBeVisible();
      await expect(welcome.locator(".onb-steps li")).toHaveCount(10);
      await expect(welcome.locator(".onb-steps li").first()).toContainText("اسمك وجوالك");
      await expect(welcome.locator(".onb-steps li").last()).toContainText("روابط البوابة للأهالي");
      await welcome.getByRole("button", { name: "ابدأ" }).click();
      await expect(page).toHaveURL(/\/e2e\/onboarding\/profile$/);
      expect(db.state.calls).toContain("onboarding_start");
      await expectRingAround(page, "#me-section");
      const bubble = page.locator(".onb-bubble");
      await expect(bubble.getByRole("heading", { name: "اسمك وجوالك" })).toBeVisible();
      await expect(bubble).toContainText("الخطوة ١ من ١٠");
      await expect(bubble.getByRole("link", { name: "مساعدة في هالخطوة" })).toHaveAttribute("href", "/dashboard/support/new?from=%2Fdashboard%2Fsettings&step=profile");
      // The bubble does not cover the highlighted element, and both are on screen.
      const [ring, card] = [await page.locator(".onb-ring").boundingBox(), await bubble.boundingBox()];
      expect(ring!.y + ring!.height <= card!.y || card!.y + card!.height <= ring!.y).toBe(true);
      expect(card!.x).toBeGreaterThanOrEqual(0);
      expect(card!.x + card!.width).toBeLessThanOrEqual(device.width);
    });

    test("«ذكّرني بعدين»: the welcome closes but the progress bar stays, with «كمّل» and no close button", async ({ page }) => {
      const db = await fakeDatabase(page, { welcome: true, done: 4 });
      await page.goto("/e2e/onboarding/home?welcome=1&done=4");
      await page.getByRole("dialog").getByRole("button", { name: "ذكّرني بعدين" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(db.state.snooze_count).toBe(1);
      const bar = page.getByRole("region", { name: "تقدّم التجهيز" });
      await expect(bar).toContainText("تجهيز روضتك ٤ من ١٠");
      await expect(bar.getByRole("button")).toHaveText(["كمّل"]);
      await page.reload();
      await expect(bar).toBeVisible();
      await bar.getByRole("button", { name: "كمّل" }).click();
      await expect(page).toHaveURL(/\/e2e\/onboarding\/students$/);
      await expectRingAround(page, "summary");
    });

    test("a step done from the data moves the guide to the next step", async ({ page }) => {
      const db = await fakeDatabase(page, { done: 4 });
      await page.goto("/e2e/onboarding/home?done=4");
      await page.getByRole("button", { name: "كمّل" }).click();
      await expect(page).toHaveURL(/\/students$/);
      await db.finish("students");
      await expect(page).toHaveURL(/\/guardians$/);
      await expect(page.getByText("✓ خلصت «الطلاب». الخطوة الجاية: أولياء الأمور والمصرّح لهم")).toBeVisible();
      await expect(page.getByRole("region", { name: "تقدّم التجهيز" })).toContainText("٥ من ١٠");
      await expect(page.locator(".onb-bubble h3")).toHaveText("أولياء الأمور والمصرّح لهم");
    });

    test("a step the member marks («تم»), «التالي» to skip for now, and «إخفاء الشرح»", async ({ page }) => {
      await fakeDatabase(page, { done: 1 });
      await page.goto("/e2e/onboarding/home?done=1");
      await page.getByRole("button", { name: "كمّل" }).click();
      await expect(page).toHaveURL(/\/device$/);
      await expectRingAround(page, "#notify button");
      await page.locator(".onb-bubble").getByRole("button", { name: "ثبّته وفعّلته ✓" }).click();
      await expect(page).toHaveURL(/\/sections$/);
      await page.locator(".onb-bubble").getByRole("button", { name: "التالي" }).click();
      await expect(page).toHaveURL(/\/classes$/);
      await expect(page.getByRole("region", { name: "تقدّم التجهيز" })).toContainText("٢ من ١٠");
      await page.locator(".onb-bubble").getByRole("button", { name: "إخفاء الشرح" }).click();
      await expect(page.locator(".onb-bubble")).toHaveCount(0);
      await expect(page.locator(".onb-ring")).toHaveCount(0);
      await expect(page.getByRole("region", { name: "تقدّم التجهيز" })).toBeVisible();
    });

    test("staff: a short tour with its own title and bar", async ({ page }) => {
      await fakeDatabase(page, { welcome: true, track: "staff" });
      await page.goto("/e2e/onboarding/home?welcome=1&track=staff");
      const welcome = page.getByRole("dialog", { name: "هلا فيك في سِير! جولة سريعة" });
      await expect(welcome.locator(".onb-steps li")).toHaveText(["اسمك وجوالك", "تثبيت التطبيق والإشعارات", "أول تسجيل حضور", "أول تقرير يومي", "مهامي", "الدعم"].map(text => new RegExp(text)));
      await welcome.getByRole("button", { name: "ذكّرني بعدين" }).click();
      await expect(page.getByRole("region", { name: "تقدّم التجهيز" })).toContainText("جولتك في سِير ٠ من ٦");
    });
  });
}

test("everything done: no welcome, no bar", async ({ page }) => {
  await fakeDatabase(page, { done: 10 });
  await page.goto("/e2e/onboarding/home?done=10");
  await expect(page.getByRole("heading", { name: "صفحة home" })).toBeVisible();
  await expect(page.locator(".onb-bar, .onb-welcome, .onb-bubble")).toHaveCount(0);
});

/** Opens the assistant (the phone top bar and the launcher both send this event) and asks it something. */
async function ask(page: Page, text: string) {
  const drawer = page.locator("#bot-drawer");
  // The page may still be starting: send the event until the drawer opens.
  await expect.poll(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("seer:open-bot")));
    return (await drawer.getAttribute("class")) ?? "";
  }).toMatch(/is-open/);
  await drawer.getByRole("textbox", { name: "اسأل مساعد سِير" }).fill(text);
  await drawer.getByRole("button", { name: "إرسال" }).click();
  return drawer.locator(".exchange").last();
}

for (const device of [{ name: "computer", width: 1366, height: 850 }, { name: "phone", width: 390, height: 844 }]) {
  test.describe(`the guide from the assistant on a ${device.name}`, () => {
    test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: device.width, height: device.height }); });

    test("the first suggestion is the setup's progress; «وش الخطوة الجاية» answers with «شغّل الشرح», which opens the next step", async ({ page }) => {
      await fakeDatabase(page, { done: 4 });
      await page.goto("/e2e/onboarding/home?done=4");
      await expect.poll(async () => { await page.evaluate(() => window.dispatchEvent(new Event("seer:open-bot"))); return (await page.locator("#bot-drawer").getAttribute("class")) ?? ""; }).toMatch(/is-open/);
      const first = page.locator("#bot-drawer .suggestions .suggestion").first();
      await expect(first).toHaveText("كمّل تجهيز روضتك (٤ من ١٠)");
      const reply = await ask(page, "وش الخطوة الجاية؟");
      await expect(reply).toContainText("أنجزتوا ٤ من ١٠، وباقي ٦. الخطوة الجاية: «الطلاب»");
      await reply.getByRole("button", { name: "شغّل الشرح" }).click();
      await expect(page.locator("#bot-drawer")).not.toHaveClass(/is-open/);
      await expect(page).toHaveURL(/\/e2e\/onboarding\/students$/);
      await expectRingAround(page, "summary");
      await expect(page.locator(".onb-bubble h3")).toHaveText("الطلاب");
    });

    test("complete: «ابدأ الشرح» replays every step from the start without changing anything", async ({ page }) => {
      const db = await fakeDatabase(page, { done: 10 });
      await page.goto("/e2e/onboarding/home?done=10");
      const reply = await ask(page, "ابدأ الشرح");
      await expect(reply).toContainText("خلّصتوا التجهيز كله");
      await reply.getByRole("button", { name: "شغّل الشرح" }).click();
      await expect(page).toHaveURL(/\/profile$/);
      const bubble = page.locator(".onb-bubble");
      await expect(bubble).toContainText("إعادة الشرح · ١ من ١٠");
      await expectRingAround(page, "#me-section");
      await bubble.getByRole("button", { name: "التالي" }).click();
      await expect(page).toHaveURL(/\/device$/);
      await expect(bubble).toContainText("إعادة الشرح · ٢ من ١٠");
      await bubble.getByRole("button", { name: "إنهاء الشرح" }).click();
      await expect(bubble).toHaveCount(0);
      // Nothing was started, marked or snoozed, and no progress bar came back.
      expect(db.state.calls.filter(name => name !== "onboarding_status")).toEqual([]);
      await expect(page.locator(".onb-bar")).toHaveCount(0);
    });

    test("«اشرح لي هالصفحة» tours the main buttons of the page open now", async ({ page }) => {
      await fakeDatabase(page, { done: 10 });
      await page.goto("/e2e/onboarding/tour");
      const reply = await ask(page, "اشرح لي هالصفحة");
      await expect(reply).toContainText("أشرح لك «الطلاب» خطوة خطوة");
      await reply.getByRole("button", { name: "شغّل شرح الصفحة" }).click();
      const bubble = page.locator(".onb-bubble");
      await expect(bubble).toContainText("شرح «الطلاب» · ١ من ٥");
      await expectRingAround(page, "main h1");
      const expected: [string, string][] = [["البحث والتصفية", "main form"], ["ملف الطالب", "main .list-row"], ["إضافة طالب", "summary"], ["استيراد من Excel", "a.btn"]];
      for (const [title, selector] of expected) {
        await bubble.getByRole("button", { name: "التالي" }).click();
        await expect(bubble.locator("h3")).toHaveText(title);
        await expectRingAround(page, selector);
      }
      await bubble.getByRole("button", { name: "خلصت" }).click();
      await expect(bubble).toHaveCount(0);
      await expect(page.locator(".onb-ring")).toHaveCount(0);
    });
  });
}

test("«اشرح لي هالصفحة» outside the main menu pages says where it works", async ({ page }) => {
  await fakeDatabase(page, { done: 10 });
  await page.goto("/e2e/onboarding/home?done=10");
  const reply = await ask(page, "اشرح لي هالصفحة");
  await expect(reply).toContainText("شرح الصفحة متاح للصفحات الرئيسية في القائمة");
});
