import { describe, expect, it } from "vitest";
import { inviteLink, inviteMessage, isInviteToken, trialLabel } from "../lib/org-invites";

describe("organization invite links", () => {
  it("puts the token after # so it is never sent to the web server", () => {
    const link = inviteLink("https://seer-app-psi.vercel.app/", "AbCdEfGhJkMnPqRsTuVwXyZa23456789");
    expect(link).toBe("https://seer-app-psi.vercel.app/invite#AbCdEfGhJkMnPqRsTuVwXyZa23456789");
    expect(new URL(link).pathname).toBe("/invite");
  });
  it("accepts only 32-character tokens from the readable alphabet", () => {
    expect(isInviteToken("AbCdEfGhJkMnPqRsTuVwXyZa23456789")).toBe(true);
    for (const bad of ["", "short", "AbCdEfGhJkMnPqRsTuVwXyZa2345678O", "AbCdEfGhJkMnPqRsTuVwXyZa23456789x", "../../etc/passwd"]) expect(isInviteToken(bad), bad).toBe(false);
  });
  it("writes the WhatsApp message in everyday Saudi Arabic with the trial length and the link", () => {
    const message = inviteMessage("مدرسة النخبة", 3, "https://x.test/invite#T");
    expect(message).toContain("حيّاكم الله");
    expect(message).toContain("«مدرسة النخبة»");
    expect(message).toContain("٣ أشهر");
    expect(message).toContain("https://x.test/invite#T");
    expect(message).toContain("٧ أيام ولمرة وحدة");
  });
  it("names trial lengths correctly", () => {
    expect([1, 2, 3, 12].map(trialLabel)).toEqual(["شهر", "شهرين", "٣ أشهر", "١٢ شهرًا"]);
  });
});
