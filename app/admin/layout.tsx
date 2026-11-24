export const dynamic = "force-dynamic";
// «سِير أدمن» is never indexed (the middleware also sends X-Robots-Tag and robots.txt disallows all).
export const metadata = {
  // absolute: not wrapped by the platform's "%s | سِير" (the home-screen name is the page title on iPhone).
  title: { absolute: "سِير أدمن", template: "%s | سِير أدمن" },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

/** Everything under /admin: the console (its own guarded layout) and its sign-in and verification pages. */
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
