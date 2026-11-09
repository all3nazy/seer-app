import { describe, expect, it } from "vitest";
import { featureOf, featureState, priceFor, renewalNotice } from "../lib/subscriptions";

describe("subscriptions in the app", () => {
  it("maps pages to sections, the most specific first", () => {
    expect(featureOf("/dashboard/finance/online")).toBe("online_payments");
    expect(featureOf("/dashboard/finance/invoices/1")).toBe("finance");
    expect(featureOf("/dashboard/staff/payroll")).toBe("payroll");
    expect(featureOf("/dashboard/children")).toBeNull();
  });
  it("tells on, off (turned off) and locked (outside the plan)", () => {
    const org = { features: ["transport", "finance"], disabled: ["finance"] };
    expect(featureState("transport", org)).toBe("on");
    expect(featureState("finance", org)).toBe("off");
    expect(featureState("payroll", org)).toBe("locked");
    expect(featureState(null, org)).toBe("on");
  });
  it("prices like the database: monthly price × months − discount", () => {
    expect(priceFor({ monthly_price: 499 }, { months: 12, discount: 20 })).toBe(4790.4);
    expect(priceFor({ monthly_price: 499 }, { months: 3, discount: 5 })).toBe(1422.15);
  });
  it("shows the renewal notice in the last 7 days and in the grace period", () => {
    expect(renewalNotice({ access: "active", status: "active", days_left: 10 })).toBeNull();
    expect(renewalNotice({ access: "active", status: "trial", days_left: 3 })).toContain("التجربة");
    expect(renewalNotice({ access: "grace", status: "grace", days_left: -2 }, 7)).toContain("٥");
    expect(renewalNotice({ access: "locked", status: "locked", days_left: -9 })).toBeNull();
  });
});
