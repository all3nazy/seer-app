"use client";
import { useEffect } from "react";
import { reportError } from "../lib/error-report";

/** Last resort when the whole layout fails: logged, with a reload button. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => { void reportError(error); }, [error]);
  return <html lang="ar" dir="rtl"><body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, textAlign: "center", padding: 24 }}>
    <main><h1 style={{ fontSize: 20 }}>صار خطأ في تحميل سِير</h1><p>انحفظ الخطأ للمراجعة. جرّب إعادة التحميل.</p>
      <button type="button" onClick={() => location.reload()} style={{ font: "inherit", padding: "10px 22px", borderRadius: 999, border: 0, background: "#3E1657", color: "#fff" }}>إعادة التحميل</button></main>
  </body></html>;
}
