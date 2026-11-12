import { expect, test } from "@playwright/test";

// The test server answers on 127.0.0.1; the middleware reads the requested host from X-Forwarded-Host,
// as on Vercel. SEER_CANONICAL_HOST is set to seersa.vercel.app for the test server.
const as = (host: string) => ({ headers: { "x-forwarded-host": host }, maxRedirects: 0 });

test("old production addresses get a 308 to the same path and query on the official address", async ({ request }) => {
  for (const host of ["seer-app-psi.vercel.app", "seerksa.vercel.app"]) {
    const response = await request.get("/pricing?ref=wa", as(host));
    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe("https://seersa.vercel.app/pricing?ref=wa");
    const deep = await request.get("/dashboard/support/x?org=1", as(host));
    expect(deep.status()).toBe(308);
    expect(deep.headers().location).toBe("https://seersa.vercel.app/dashboard/support/x?org=1");
  }
});

test("the official address, previews, /api and /auth are served where they are", async ({ request }) => {
  expect((await request.get("/pricing", as("seersa.vercel.app"))).status()).toBe(200);
  expect((await request.get("/pricing", as("seer-git-pilot-polish-segno-sa.vercel.app"))).status()).toBe(200);
  expect((await request.get("/api/messages/dispatch", as("seer-app-psi.vercel.app"))).status()).not.toBe(308);
  expect((await request.get("/auth/callback", as("seer-app-psi.vercel.app"))).status()).not.toBe(308);
});
