"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { featureKeys, featureLabels } from "../lib/subscriptions";
import { notify } from "./feedback";

/** The owner turns sections on and off within the plan and picks the brand colours. */
export function OrgCustomizer({ organizationId, features, disabled, primary, accent, hidden = [] }: { organizationId: string; features: string[]; disabled: string[]; primary: string | null; accent: string | null; hidden?: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [off, setOff] = useState<string[]>(disabled);
  const [primaryColor, setPrimary] = useState(primary ?? "#3E1657");
  const [accentColor, setAccent] = useState(accent ?? "#FF7A59");
  const [useColors, setUseColors] = useState(Boolean(primary || accent));
  const save = () => start(async () => {
    const { error } = await getSupabaseBrowserClient().rpc("save_org_settings", { org: organizationId, disabled: off, primary_color: useColors ? primaryColor : null, accent_color: useColors ? accentColor : null });
    if (error) { notify(error.code === "42501" ? "التخصيص لمالك المنشأة." : "تعذر الحفظ.", "error"); return; }
    notify("انحفظ التخصيص.", "info", "done");
    router.refresh();
  });
  return <div className="card" style={{ display: "grid", gap: 16 }}>
    <div>
      <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>الأقسام</h3>
      <p className="hint" style={{ margin: "0 0 10px" }}>الأقسام المطفية تختفي من القوائم ومن المساعد لكل الفريق، وبياناتها تبقى محفوظة.</p>
      <ul className="section-toggles">{featureKeys.filter(key => !hidden.includes(key)).map(key => {
        const inPlan = features.includes(key);
        return <li key={key}>
          <span id={`section-${key}`}>{featureLabels[key]}</span>
          {inPlan
            ? <span className="toggle-state"><span aria-hidden="true">{off.includes(key) ? "مطفي" : "شغّال"}</span>
                <button type="button" className="switch" role="switch" aria-checked={!off.includes(key)} aria-labelledby={`section-${key}`}
                  onClick={() => setOff(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])} /></span>
            : <Link className="chip-soft" href={`/dashboard/billing?upgrade=${key}`}>🔒 رقّ باقتك</Link>}
        </li>;
      })}</ul>
    </div>
    <div>
      <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>ألوان الهوية</h3>
      <label className="quote-check"><input type="checkbox" checked={useColors} onChange={event => setUseColors(event.target.checked)} /> استخدم ألوان منشأتي في الواجهة</label>
      {useColors ? <div className="composer" style={{ marginTop: 10 }}>
        <label>اللون الأساسي<input type="color" value={primaryColor} onChange={event => setPrimary(event.target.value)} /></label>
        <label>اللون المميز<input type="color" value={accentColor} onChange={event => setAccent(event.target.value)} /></label>
        <span className="brand-preview" style={{ background: primaryColor, color: "#fff" }}>معاينة الزر<span style={{ background: accentColor }} /></span>
      </div> : null}
      <p className="hint" style={{ margin: "8px 0 0" }}>الشعار والاسم النظامي من <Link href="/dashboard/finance/branding">هوية المستندات</Link>.</p>
    </div>
    <span><button type="button" className="btn btn-primary" disabled={pending} onClick={save}>{pending ? "جارٍ الحفظ…" : "حفظ التخصيص"}</button></span>
  </div>;
}
