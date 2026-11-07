"use client";
import { useTransition } from "react";
import { setMyName } from "../app/dashboard/team/actions";
import { notify } from "./feedback";

export function MyNameForm({ current }: { current: string }) {
  const [pending, start] = useTransition();
  return <form className="composer" action={data => start(async () => {
    const result = await setMyName(data);
    notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info");
  })}>
    <label>الاسم<input name="display_name" required maxLength={80} defaultValue={current} placeholder="اكتب اسمك" autoComplete="name" /></label>
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ الاسم"}</button>
  </form>;
}
