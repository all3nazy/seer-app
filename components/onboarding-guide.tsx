"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { arNumber } from "../lib/dates";
import { computerOnlySection } from "../lib/navigation";
import { GUIDE_EVENT, barLabel, guideFor, onStepPage, pageTour, placeBubble, PHONE_WIDTH, stepGuides, type BubblePlacement, tourPathFor, stepHelpLink, welcomeTitle, type GuideRequest, type OnboardingStatus, type PageTour, type StepKey, type StepState, type Target } from "../lib/onboarding";
import type { Stage } from "../lib/stage";
import { notify } from "./feedback";

const GUIDE_KEY = "seer-guide";
const SKIP_KEY = "seer-guide-skip";
const REPLAY_KEY = "seer-guide-replay";
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

/** A page tour in progress: its stops, the one shown, and the page it belongs to. */
type Tour = PageTour & { index: number; path: string };

/**
 * Guided setup for the current organization: the welcome screen on first visit, a small progress bar
 * above every page until all steps are done (it has no close button), and while guiding, the button
 * of the current step is highlighted with a short explanation. Steps measured from the data finish
 * by themselves; the guide then moves to the next one.
 * The assistant and the settings can also start it (GUIDE_EVENT): the setup from the first missing
 * step, a replay of every step once the setup is complete (nothing in the database changes), or a
 * short tour of the page open now.
 */
export function OnboardingGuide({ organizationId, stage, initial, pagePrefix }: { organizationId: string; stage: Stage; initial: OnboardingStatus | null;
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
  // The highlight ring and where the bubble sits (beside, below, above, or pinned to the bottom).
  const [layout, setLayout] = useState<BubblePlacement | null>(null);
  const bubbleRef = useRef<HTMLElement>(null);
  const [missing, setMissing] = useState(false);
  // Replaying a completed setup (index into its steps), or touring the page open now.
  const [replay, setReplayState] = useState<number | null>(null);
  const setReplay = useCallback((index: number | null) => { write(REPLAY_KEY, index === null ? null : `${organizationId}:${index}`); setReplayState(index); }, [organizationId]);
  const [tour, setTour] = useState<Tour | null>(null);
  const previous = useRef<StepKey | null>(null);
  // The first answer from the database only brings the status up to date; it announces nothing.
  const synced = useRef(false);
  const skipNext = useRef(false);
  const rpc = useCallback(async (name: string, args: Record<string, unknown> = {}): Promise<OnboardingStatus | null> => {
    const { data, error } = await getSupabaseBrowserClient().rpc(name, { org: organizationId, ...args });
    if (error || !data) return null;
    if (!synced.current) { synced.current = true; skipNext.current = true; }
    setStatus(data as OnboardingStatus);
    return data as OnboardingStatus;
  }, [organizationId]);

  // Guiding and skipped steps last for this browser tab.
  useEffect(() => {
    setGuiding(read(GUIDE_KEY) === organizationId);
    const replaying = read(REPLAY_KEY)?.split(":");
    setReplayState(replaying && replaying[0] === organizationId && /^\d+$/.test(replaying[1] ?? "") ? Number(replaying[1]) : null);
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
  const steps = status?.steps ?? [];
  useEffect(() => {
    const device = steps.find(step => step.step === "device");
    if (!device || device.done) return;
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (standalone && typeof Notification !== "undefined" && Notification.permission === "granted") void rpc("onboarding_mark", { step: "device" });
  }, [steps, rpc]);
  // A page tour belongs to its page.
  useEffect(() => { setTour(current => current && current.path !== path ? null : current); }, [path]);

  const welcome = Boolean(status?.show_welcome) && !dismissed && !tour && replay === null;
  const open = steps.filter(step => !step.done);
  const current: StepState | null = open.find(step => !skipped.includes(step.step)) ?? open[0] ?? null;
  const isHere = useCallback((step: StepKey) => pagePrefix ? path === `${pagePrefix}/${step}` : onStepPage(step, path), [pagePrefix, path]);
  const replayStep = replay !== null ? steps[replay]?.step ?? null : null;
  // What the bubble points at now: a page tour first, then a replay, then the setup step.
  const mode: "tour" | "replay" | "setup" | null = tour ? "tour" : replayStep ? "replay" : guiding && current ? "setup" : null;
  const step = mode === "replay" ? replayStep : mode === "setup" ? current!.step : null;
  const here = mode === "tour" ? true : step ? isHere(step) : false;
  const targets: Target[] | null = mode === "tour" ? tour!.stops[tour!.index]?.targets ?? null : step ? stepGuides[step].targets : null;
  const targetKey = mode === "tour" ? `tour:${tour!.index}` : step ? `${mode}:${step}` : null;

  const go = useCallback((key: StepKey) => {
    const target = pagePrefix ? `${pagePrefix}/${key}` : stepGuides[key].path;
    if (!isHere(key) || target.includes("#")) router.push(target);
  }, [isHere, pagePrefix, router]);
  const startGuiding = () => { write(GUIDE_KEY, organizationId); setGuiding(true); };
  const stopGuiding = () => { write(GUIDE_KEY, null); setGuiding(false); };

  // Started from the assistant or the settings.
  useEffect(() => {
    const onRequest = (event: Event) => {
      const request = (event as CustomEvent<GuideRequest>).detail;
      if (request?.mode === "page") {
        const found = pageTour(tourPathFor(path));
        if (!found) { notify("شرح الصفحة متاح للصفحات الرئيسية في القائمة.", "info"); return; }
        setReplay(null);
        setTour({ ...found, index: 0, path });
        return;
      }
      void (async () => {
        const latest = (await rpc("onboarding_status")) ?? status;
        if (!latest || !latest.steps.length) { notify("الشرح غير متاح الآن. حاول بعد شوي.", "error"); return; }
        setTour(null);
        setDismissed(true);
        const left = latest.steps.filter(item => !item.done);
        if (!latest.complete && left.length) {
          if (!latest.started) await rpc("onboarding_start");
          setReplay(null);
          startGuiding();
          go((left.find(item => !skipped.includes(item.step)) ?? left[0]).step);
        } else {
          // Complete: the same steps again from the start, without changing anything.
          setReplay(0);
          go(latest.steps[0].step);
        }
      })();
    };
    window.addEventListener(GUIDE_EVENT, onRequest);
    return () => window.removeEventListener(GUIDE_EVENT, onRequest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, status, skipped, go, rpc]);

  // A step just finished: say so and move to the next one.
  useEffect(() => {
    const now = current?.step ?? null;
    if (skipNext.current) { skipNext.current = false; previous.current = now; return; }
    const was = previous.current;
    previous.current = now;
    if (!was || was === now) return;
    const finished = steps.find(item => item.step === was)?.done;
    if (!finished) return;
    notify(current ? `✓ خلصت «${stepGuides[was].title}». الخطوة الجاية: ${stepGuides[current.step].title}` : "🎉 خلصتوا التجهيز كله. الله يوفقكم!", "info", "done");
    if (guiding && current && replay === null && !tour) go(current.step);
    if (!current) stopGuiding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Highlight: follow the target while the page scrolls or changes, and keep the bubble off it.
  // A page-tour stop whose button is not on this page is skipped.
  useEffect(() => {
    if (!targets || !here || welcome) { setLayout(null); setMissing(false); return; }
    let element: HTMLElement | null = null;
    let tries = 0, scrolled = false;
    const shown = Date.now();
    const place = () => {
      element = element?.isConnected ? element : findTarget(targets);
      if (!element) {
        tries++;
        if (tries > 8 && mode === "tour") { setTour(current => current ? nextStop(current) : null); return; }
        if (tries > 12) setMissing(true);
        setLayout(null);
        return;
      }
      setMissing(false);
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const card = bubbleRef.current;
      const height = card?.offsetHeight || 200;
      const phone = viewport.width < PHONE_WIDTH;
      if (!scrolled) {
        scrolled = true;
        const rect = element.getBoundingClientRect();
        // On a phone (and for elements taller than the room left) the element starts near the top,
        // above the pinned card; otherwise it is centred.
        if (phone || rect.height > viewport.height - height - 80) window.scrollBy({ top: rect.top - 76, behavior: "instant" as ScrollBehavior });
        else element.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
      }
      const rect = element.getBoundingClientRect();
      const padded = { top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 };
      // The pinned card's top edge: measured when it is pinned, estimated before.
      const dockTop = card?.classList.contains("docked") ? card.getBoundingClientRect().top : viewport.height - height - (phone ? 96 : 24);
      const next = placeBubble(padded, { height }, viewport, dockTop);
      // Right after the step opens, an element hidden under the pinned card is brought up.
      if (next.side === "dock" && !next.ring && Date.now() - shown < 1500) window.scrollBy({ top: rect.top - 76, behavior: "instant" as ScrollBehavior });
      setLayout(current => current && JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    place();
    const timer = window.setInterval(place, 200);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.clearInterval(timer); window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, here, welcome, path]);

  async function begin() {
    if (!current) return;
    setBusy(true);
    await rpc("onboarding_start");
    setBusy(false);
    setDismissed(true);
    startGuiding();
    go(current.step);
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
    const list = [...skipped.filter(item => item !== current.step), current.step];
    const following = open.find(item => !list.includes(item.step));
    const kept = following ? list : [];
    setSkipped(kept);
    write(SKIP_KEY, JSON.stringify(kept));
    const to = following ?? open.find(item => item.step !== current.step) ?? current;
    go(to.step);
  }
  function nextReplay() {
    if (replay === null) return;
    if (replay + 1 >= steps.length) { setReplay(null); notify("✓ خلص الشرح. ارجع له متى ما تبي من المساعد.", "info", "done"); return; }
    setReplay(replay + 1);
    go(steps[replay + 1].step);
  }

  const showBar = Boolean(status && !status.complete && current);
  const total = status?.total ?? 0;
  let bubble: React.ReactNode = null;
  if (mode === "tour" && tour) {
    const stop = tour.stops[tour.index];
    const last = tour.index + 1 >= tour.stops.length;
    bubble = stop ? <>
      <span className="hint">شرح «{tour.title}» · {arNumber(tour.index + 1)} من {arNumber(tour.stops.length)}</span>
      <h3 id="onb-bubble-title">{stop.title}</h3>
      <p>{stop.text}</p>
      <div className="onb-actions">
        <button type="button" className="btn btn-sm btn-primary" onClick={() => { if (last) { setTour(null); notify("✓ خلص شرح الصفحة.", "info", "done"); } else setTour(nextStop(tour)); }}>{last ? "خلصت" : "التالي"}</button>
        {!last ? <button type="button" className="btn btn-sm" onClick={() => setTour(null)}>إنهاء الشرح</button> : null}
      </div>
    </> : null;
  } else if (mode === "replay" && step) {
    const guide = guideFor(step, status!.track);
    bubble = <>
      <span className="hint">إعادة الشرح · {arNumber((replay ?? 0) + 1)} من {arNumber(steps.length)}</span>
      <h3 id="onb-bubble-title">{guide.title}</h3>
      {here ? <p>{guide.text}</p> : <p>هالخطوة في صفحة ثانية.</p>}
      <div className="onb-actions">
        {!here ? <button type="button" className="btn btn-sm btn-primary" onClick={() => go(step)}>روح لها</button> : null}
        <button type="button" className="btn btn-sm btn-primary" onClick={nextReplay}>{(replay ?? 0) + 1 >= steps.length ? "خلصت" : "التالي"}</button>
        <button type="button" className="btn btn-sm" onClick={() => setReplay(null)}>إنهاء الشرح</button>
      </div>
    </>;
  } else if (mode === "setup" && current && status) {
    const guide = guideFor(current.step, status.track);
    const index = steps.findIndex(item => item.step === current.step) + 1;
    const computerOnly = Boolean(computerOnlySection(stepGuides[current.step].path.split("#")[0]));
    bubble = <>
      <span className="hint">الخطوة {arNumber(index)} من {arNumber(total)}</span>
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
    </>;
  }

  return <>
    {showBar && status && current ? <div className="onb-bar" role="region" aria-label="تقدّم التجهيز">
      <span className="onb-bar-text"><strong>{barLabel(status.track, stage)}</strong> {arNumber(status.done)} من {arNumber(total)}</span>
      <progress className="onb-progress" max={total} value={status.done} aria-label={`${total ? Math.round((status.done / total) * 100) : 0}٪`} />
      <button type="button" className="btn btn-sm btn-primary" onClick={() => { setTour(null); setReplay(null); startGuiding(); go(current.step); }}>كمّل</button>
    </div> : null}

    {welcome && status && current ? <div className="onb-welcome-wrap">
      <section className="onb-welcome card" role="dialog" aria-modal="true" aria-labelledby="onb-welcome-title">
        <h2 id="onb-welcome-title">{welcomeTitle(status.track, stage)}</h2>
        <p className="hint">{status.track === "org" ? "خطوات قصيرة بالترتيب، وكل خطوة نوديك لصفحتها ونأشّر لك على الزر. اللي تسويه ينعلّم تلقائيًا." : "دقيقتين ونعرّفك على أهم الأماكن اللي بتحتاجها كل يوم."}</p>
        <ol className="onb-steps">{steps.map(item => <li key={item.step} className={item.done ? "done" : ""}>
          <span className="onb-check" aria-hidden="true">{item.done ? "✓" : ""}</span>{stepGuides[item.step].title}{item.done ? <span className="sr-only"> (تمت)</span> : null}
        </li>)}</ol>
        <div className="onb-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void begin()}>ابدأ</button>
          <button type="button" className="btn" disabled={busy} onClick={() => void later()}>ذكّرني بعدين</button>
        </div>
      </section>
    </div> : null}

    {bubble && !welcome ? <>
      {layout?.ring ? <div className="onb-ring" aria-hidden="true" style={{ top: layout.ring.top, left: layout.ring.left, width: layout.ring.width, height: layout.ring.height }} /> : null}
      <section ref={bubbleRef} className={`onb-bubble${!layout ? " floating" : layout.side === "dock" ? " docked" : ""}`} role="dialog" aria-labelledby="onb-bubble-title" aria-live="polite"
        data-mode={mode ?? undefined} data-side={layout?.side}
        style={layout && layout.side !== "dock" ? { top: layout.top, left: layout.left, width: layout.width } : undefined}>{bubble}</section>
    </> : null}
  </>;
}

function nextStop(tour: Tour): Tour | null {
  return tour.index + 1 < tour.stops.length ? { ...tour, index: tour.index + 1 } : null;
}
