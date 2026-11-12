"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { isDangerous } from "../lib/confirm";

/**
 * In-app confirmation instead of the browser's confirm(): Arabic buttons, the platform's look, and a
 * native <dialog> opened with showModal() so it sits above any open drawer or dialog.
 */
type Ask = { message: string; resolve: (ok: boolean) => void };
let show: ((ask: Ask) => void) | null = null;


/** Asks the question; resolves true on «نعم، متأكد» / «تأكيد», false on «تراجع», Escape or closing. */
export function confirmAction(message: string): Promise<boolean> {
  return new Promise(resolve => {
    if (show) show({ message, resolve });
    else resolve(typeof window !== "undefined" && window.confirm(message)); // before the layer mounts
  });
}

/**
 * For a form that asks before it is sent: stops this submit, asks, and on yes sends the form again
 * (marked as confirmed so the second submit goes through).
 */
export function confirmSubmit(event: FormEvent<HTMLFormElement>, message: string) {
  const form = event.currentTarget;
  if (form.dataset.confirmed === "1") { delete form.dataset.confirmed; return; }
  event.preventDefault();
  void confirmAction(message).then(ok => { if (ok) { form.dataset.confirmed = "1"; form.requestSubmit(); } });
}

/** Mounted once in the root layout. */
export function ConfirmLayer() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const current = useRef<Ask | null>(null);
  useEffect(() => {
    show = next => {
      current.current?.resolve(false); // a newer question replaces an unanswered one
      current.current = next;
      setAsk(next);
    };
    return () => { show = null; };
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (ask && element && !element.open) element.showModal();
  }, [ask]);
  const answer = (ok: boolean) => {
    const pending = current.current;
    current.current = null;
    dialog.current?.close();
    setAsk(null);
    pending?.resolve(ok);
  };
  const danger = ask ? isDangerous(ask.message) : false;
  return <dialog ref={dialog} className="confirm-dialog" aria-labelledby="confirm-message" onCancel={event => { event.preventDefault(); answer(false); }}>
    {ask ? <form method="dialog" onSubmit={event => { event.preventDefault(); answer(true); }}>
      <p id="confirm-message">{ask.message}</p>
      <div className="confirm-actions">
        <button type="submit" className={danger ? "btn btn-danger-solid" : "btn btn-primary"} autoFocus>{danger ? "نعم، متأكد" : "تأكيد"}</button>
        <button type="button" className="btn" onClick={() => answer(false)}>تراجع</button>
      </div>
    </form> : null}
  </dialog>;
}
