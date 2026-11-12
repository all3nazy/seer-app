"use client";
import { useRouter } from "next/navigation";

/**
 * The one «رجوع» button at the top of detail pages: an arrow and a label, large enough to tap on a
 * phone. It goes to `href`. With `history`, it goes back to the previous page when the person came
 * from inside the platform, and to `href` otherwise (opened from a link or a notification).
 */
export function BackLink({ href, label = "رجوع", history = false }: { href: string; label?: string; history?: boolean }) {
  const router = useRouter();
  return <a className="back-link no-print" href={href} data-back={history ? "history" : undefined}
    onClick={event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      const fromHere = history && window.history.length > 1 && document.referrer.startsWith(location.origin);
      if (fromHere) router.back(); else router.push(href);
    }}>
    {/* Right-pointing arrow: «back» in a right-to-left page. */}
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    <span>{label}</span>
  </a>;
}
