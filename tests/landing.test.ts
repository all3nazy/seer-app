import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { joinMailto, landingFeatures, landingSecurity, landingSteps } from "../lib/landing";
import { navLinks } from "../lib/navigation";

describe("home page copy", () => {
  it("has the six features, three steps and four safety points", () => {
    expect(landingFeatures.map(item => item.title)).toEqual(["الحضور والتسليم", "بوابة ولي الأمر", "التقارير اليومية والإعلانات", "المالية والفواتير", "الفريق والمهام", "المساعد اللي يفهم عربي"]);
    expect(landingSteps).toHaveLength(3);
    expect(landingSecurity).toHaveLength(4);
  });
  it("describes sections the platform really has", () => {
    const pages = navLinks.map(link => link.href);
    for (const href of ["/dashboard/attendance", "/dashboard/pickup", "/dashboard/daily", "/dashboard/announcements", "/dashboard/finance", "/dashboard/team", "/dashboard/tasks", "/dashboard/assistant"]) expect(pages, href).toContain(href);
  });
  it("makes no claims about certificates", () => {
    const text = JSON.stringify([landingFeatures, landingSecurity, landingSteps]);
    for (const claim of ["ISO", "SOC", "شهادة", "معتمد", "100%"]) expect(text, claim).not.toContain(claim);
  });
  it("the join email has the subject ready", () => {
    expect(decodeURIComponent(joinMailto)).toContain("subject=طلب انضمام لتجربة سِير");
  });
  it("in pilot mode the second button scrolls to the join section", () => {
    const page = readFileSync("app/page.tsx", "utf8");
    expect(page).toContain('href="#join">أبي أنضم للتجربة');
    expect(page).toContain('id="join"');
  });
});
