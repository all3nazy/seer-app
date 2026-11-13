"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { arNumber } from "../lib/dates";
import { computerOnlySection } from "../lib/navigation";
import { barLabel, guideFor, onStepPage, stepGuides, stepHelpLink, welcomeTitle, type OnboardingStatus, type StepKey, type StepState, type Target } from "../lib/onboarding";
import type { Stage } from "../lib/stage";
import { notify } from "./feedback";

const GUIDE_KEY = "seer-guide";
const SKIP_KEY = "seer-guide-skip";
const read = (key: string) => { try { return sessionStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string | null) => { try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value); } catch { /* storage unavailable */ } };

/** The first visible element for a step: by selector, and by its text when given. */
export function findTarget(targets: Target[], root: ParentNode = document): HTMLElement | null {
  for (const target of targets) {
    for (const element of Array.from(root.querySelectorAll<HTMLElement>(target.selector))) {
      if (target.text && !(element.textContent ?? "").includes(target.text)) continue;
      const box = element.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) return element;
    }
  }
  return null;
}

type Box = { top: number; left: number; width: number; height: number };

/**
 * Guided setup for the current organization: the welcome screen on first visit, a small progress bar
 * above every page until all steps are done (it has no close button), and while guiding, the button
 * of the current step is highlighted with a short explanation. Steps measured from the data finish
 * by themselves; the guide then moves to the next one.
 */
export function OnboardingGuide({ organizationId, stage, initial, pagePrefix }: { organizationId: string; stage: Stage; initial: OnboardingStatus;
  /** Browser tests only: each step lives on `${pagePrefix}/${step}`. */
  pagePrefix?: string }) {
  const router = useRouter();
  const path = usePathname();
  const [status, setStatus] = useState(initial);
  const [guiding, setGuiding] = useState(false);
  const [skipped, setSkipped] = useState<StepKey[]>([]);
  // Closed here (after «ابدأ» or «ذكّرني بعدين») before the database answers.
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [missing, setMissing] = useState(false);
  const previous = useRef<StepKey | null>(null);
  const rpc = useCallback(async (name: string, args: Record<string, unknown> = {}) => {
    const { data, error } = await getSupabaseBrowserClient().rpc(name, { org: organizationId, ...args });
    if (!error && data) setStatus(data as OnboardingStatus);
    return !error;
  }, [organizationId]);

  // Guiding and skipped steps last for this browser tab.
  useEffect(() => {
    setGuiding(read(GUIDE_KEY) === organizationId);
    try { setSkipped(JSON.parse(read(SKIP_KEY) ?? "[]")); } catch { setSkipped([]); }
  }, [organizationId]);
  // A newer page from the server (e.g. after saving) asks the database again rather than going back to an older status.
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } void rpc("onboarding_status"); }, [initial, rpc]);
  // The status follows the data: on every page, when the tab comes back, and every few seconds while guiding.
  useEffect(() => { void rpc("onboarding_status"); }, [path, rpc]);
  useEffect(() => {
    const again = () => { if (document.visibilityState === "visible") void rpc("onboarding_status"); };
    document.addEventListener("visibilitychange", again);
    const timer = guiding ? window.setInterval(again, 8000) : undefined;
    return () => { document.removeEventListener("visibilitychange", again); if (timer) window.clearInterval(timer); };
  }, [guiding, rpc]);
  // Installed (opened from the home screen) with notifications allowed: the device step is done.
  useEffect(() => {
    const device = status.steps.find(step => step.step === "device");
    if (!device || device.done) return;
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (standalone && typeof Notification !== "undefined" && Notification.permission === "granted") void rpc("onboarding_mark", { step: "device" });
  }, [status.steps, rpc]);

  const welcome = status.show_welcome && !dismissed;
  const open = status.steps.filter(step => !step.done);
  const current: StepState | null = open.find(step => !skipped.includes(step.step)) ?? open[0] ?? null;
  const guide = current ? guideFor(current.step, status.track) : null;
  const isHere = useCallback((step: StepKey) => pagePrefix ? path === `${pagePrefix}/${step}` : onStepPage(step, path), [pagePrefix, path]);
  const here = current ? isHere(current.step) : false;
  const step = current?.step ?? null;

  const go = useCallback((step: StepKey) => {
    const target = pagePrefix ? `${pagePrefix}/${step}` : stepGuides[step].path;
    if (!isHere(step) || target.includes("#")) router.push(target);
  }, [isHere, pagePrefix, router]);
  const startGuiding = () => { write(GUIDE_KEY, organizationId); setGuiding(true); };
  const stopGuiding = () => { write(GUIDE_KEY, null); setGuiding(false); };

  // A step just finished: say so and move to the next one.
  useEffect(() => {
    const was = previous.current;
    previous.current = current?.step ?? null;
    if (!was || was === current?.step) return;
    const finished = status.steps.find(step => step.step === was)?.done;
    if (!finished) return;
    notify(current ? `✓ خلصت «${stepGuides[was].title}». الخطوة الجاية: ${stepGuides[current.step].title}` : "🎉 خلصتوا التجهيز كله. الله يوفقكم!", "info", "done");
    if (guiding && current) go(current.step);
    if (!current) stopGuiding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.step]);

  // Highlight: follow the target while the page scrolls or changes.
  useEffect(() => {
    if (!guiding || !step || !here || welcome) { setBox(null); setMissing(false); return; }
    const targets = stepGuides[step].targets;
    let element: HTMLElement | null = null;
    let tries = 0, scrolled = false;
    const place = () => {
      element = element?.isConnected ? element : findTarget(targets);
      if (!element) { tries++; if (tries > 12) setMissing(true); setBox(null); return; }
      setMissing(false);
      if (!scrolled) { element.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior }); scrolled = true; }
      const rect = element.getBoundingClientRect();
      setBox({ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 });
    };
    place();
    const timer = window.setInterval(place, 250);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.clearInterval(timer); window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [guiding, step, here, welcome, path]);

  if (status.complete || !current || !guide) return null;

  async function begin() {
    setBusy(true);
    await rpc("onboarding_start");
    setBusy(false);
    setDismissed(true);
    startGuiding();
    go(current!.step);
  }
  async function later() {
    setBusy(true);
    const ok = await rpc("onboarding_snooze");
    setBusy(false);
    setDismissed(true);
    if (ok) notify("تمام، نذكّرك بعد ١٢ ساعة. وتقدر تكمّل متى ما تبي من الشريط فوق.", "info");
  }
  async function mark() {
    if (!current) return;
    setBusy(true);
    const ok = await rpc("onboarding_mark", { step: current.step });
    setBusy(false);
    if (!ok) notify("تعذر الحفظ. حاول مرة ثانية.", "error");
  }
  function next() {
    if (!current) return;
    const list = [...skipped.filter(step => step !== current.step), current.step];
    const following = open.find(step => !list.includes(step.step));
    const kept = following ? list : [];
    setSkipped(kept);
    write(SKIP_KEY, JSON.stringify(kept));
    const to = following ?? open.find(step => step.step !== current.step) ?? current;
    go(to.step);
  }

  const index = status.steps.findIndex(step => step.step === current.step) + 1;
  const percent = status.total ? Math.round((status.done / status.total) * 100) : 0;
  const computerOnly = Boolean(computerOnlySection(stepGuides[current.step].path.split("#")[0]));

  return <>
    <div className="onb-bar" role="region" aria-label="تقدّم التجهيز">
      <span className="onb-bar-text"><strong>{barLabel(status.track, stage)}</strong> {arNumber(status.done)} من {arNumber(status.total)}</span>
      <progress className="onb-progress" max={status.total} value={status.done} aria-label={`${percent}٪`} />
      <button type="button" className="btn btn-sm btn-primary" onClick={() => { startGuiding(); go(current.step); }}>كمّل</button>
    </div>

    {welcome ? <div className="onb-welcome-wrap">
      <section className="onb-welcome card" role="dialog" aria-modal="true" aria-labelledby="onb-welcome-title">
        <h2 id="onb-welcome-title">{welcomeTitle(status.track, stage)}</h2>
        <p className="hint">{status.track === "org" ? "خطوات قصيرة بالترتيب، وكل خطوة نوديك لصفحتها ونأشّر لك على الزر. اللي تسويه ينعلّم تلقائيًا." : "دقيقتين ونعرّفك على أهم الأماكن اللي بتحتاجها كل يوم."}</p>
        <ol className="onb-steps">{status.steps.map(step => <li key={step.step} className={step.done ? "done" : ""}>
          <span className="onb-check" aria-hidden="true">{step.done ? "✓" : ""}</span>{stepGuides[step.step].title}{step.done ? <span className="sr-only"> (تمت)</span> : null}
        </li>)}</ol>
        <div className="onb-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void begin()}>ابدأ</button>
          <button type="button" className="btn" disabled={busy} onClick={() => void later()}>ذكّرني بعدين</button>
        </div>
      </section>
    </div> : null}

    {guiding && !welcome ? <>
      {box ? <div className="onb-ring" aria-hidden="true" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} /> : null}
      <section className={`onb-bubble${box ? "" : " floating"}`} role="dialog" aria-labelledby="onb-bubble-title" aria-live="polite"
        style={box ? bubblePlace(box) : undefined}>
        <span className="hint">الخطوة {arNumber(index)} من {arNumber(status.total)}</span>
        <h3 id="onb-bubble-title">{guide.title}</h3>
        {here ? <p>{guide.text}</p> : <p>الخطوة الجاية في صفحة ثانية.</p>}
        {here && missing ? <p className="hint">{computerOnly ? "هالخطوة تنفتح على الكمبيوتر أو الآيباد. كمّلها من هناك متى ما تيسّر." : "ما لقيت الزر في الصفحة. انزل تحت شوي، أو اطلب مساعدة."}</p> : null}
        <div className="onb-actions">
          {!here ? <button type="button" className="btn btn-sm btn-primary" onClick={() => go(current.step)}>روح لها</button> : null}
          {here && current.markable && guide.mark ? <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void mark()}>{guide.mark}</button> : null}
          {open.length > 1 ? <button type="button" className="btn btn-sm" onClick={next}>التالي</button> : null}
          <button type="button" className="btn btn-sm" onClick={stopGuiding}>إخفاء الشرح</button>
        </div>
        <Link className="onb-help" href={stepHelpLink(current.step)} onClick={stopGuiding}>مساعدة في هالخطوة</Link>
      </section>
    </> : null}
  </>;
}

/** Under the target when there is room, otherwise above it; on phones the bubble sits at the bottom (CSS). */
function bubblePlace(box: Box): React.CSSProperties {
  if (typeof window === "undefined" || window.innerWidth < 700) return {};
  const width = 340, below = box.top + box.height + 12;
  const left = Math.min(Math.max(12, box.left + box.width / 2 - width / 2), window.innerWidth - width - 12);
  return below + 220 < window.innerHeight ? { top: below, left, width } : { top: Math.max(12, box.top - 232), left, width };
}
