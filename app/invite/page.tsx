import { Logo } from "../../components/icons";
import { InviteAccept } from "../../components/invite-accept";
import { LegalFooter } from "../../components/legal-page";

export const metadata = { title: "تفعيل منشأتك", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The invite link sent to a school owner: /invite#TOKEN (the token stays in the browser). */
export default function InvitePage() {
  // No skip link here: the token lives in the address #fragment, and an in-page link would replace it.
  return <><main className="shell">
    <header className="top"><Logo /></header>
    <section className="card login-card" aria-labelledby="invite-title"><InviteAccept /></section>
    <LegalFooter />
  </main></>;
}
