"use client";
import { useTransition } from "react";
import { setMyPhone } from "../app/dashboard/team/actions";
import { notify } from "./feedback";

export function MyPhoneForm({ current }: { current: string }) {
  const [pending, start] = useTransition();
  return <form className="composer" action={data => start(async () => {
    const result = await setMyPhone(data);
    notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info");
  })}>
    <label>رقم الجوال<input type="tel" name="phone" maxLength={16} dir="ltr" defaultValue={current} placeholder="05xxxxxxxx" autoComplete="tel" /></label>
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ الرقم"}</button>
  </form>;
}
