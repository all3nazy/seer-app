"use client";
import { useState } from "react";
import { durationLabel, featureKeys, featureLabels, priceFor, riyal, type Duration, type Plan } from "../lib/subscriptions";
import { arNumber } from "../lib/dates";

/** Plans side by side with a duration switch, then the full comparison of sections. */
export function PricingTable({ plans, durations }: { plans: Plan[]; durations: Duration[] }) {
  const [months, setMonths] = useState(durations.find(item => item.months === 12)?.months ?? durations[0]?.months ?? 1);
  const duration = durations.find(item => item.months === months) ?? { months: 1, discount: 0 };
  return <>
    <div className="segments" role="radiogroup" aria-label="مدة الاشتراك" style={{ justifyContent: "center", marginBottom: 16 }}>
      {durations.map(item => <button key={item.months} type="button" role="radio" aria-checked={item.months === months} className="pick" aria-pressed={item.months === months} onClick={() => setMonths(item.months)}>
        {durationLabel(item.months)}{Number(item.discount) ? ` · خصم ${arNumber(Number(item.discount))}٪` : ""}
      </button>)}
    </div>
    <div className="plan-grid">{plans.map((plan, index) => {
      const total = priceFor(plan, duration);
      return <article key={plan.id} className={`card plan-card${index === plans.length - 1 ? " featured" : ""}`}>
        <h2>{plan.name}</h2>
        {plan.description ? <p className="hint">{plan.description}</p> : null}
        <p className="plan-price"><strong>{riyal(Math.round((total / duration.months) * 100) / 100)}</strong> <span>شهريًا</span></p>
        <p className="hint">{duration.months > 1 ? `${riyal(total)} لمدة ${durationLabel(duration.months)}` : "يُدفع شهريًا"}</p>
        <ul className="plan-features">{featureKeys.filter(key => plan.features.includes(key)).map(key => <li key={key}>✓ {featureLabels[key]}</li>)}</ul>
        <a className={index === plans.length - 1 ? "primary-button" : "btn"} href="/signup">ابدأ التجربة المجانية</a>
      </article>;
    })}</div>
    <section className="card" style={{ marginTop: 24 }} aria-labelledby="compare-title">
      <h2 id="compare-title">مقارنة المزايا</h2>
      <div className="table-wrap"><table className="links-table compare-table"><thead><tr><th>القسم</th>{plans.map(plan => <th key={plan.id}>{plan.name}</th>)}</tr></thead>
        <tbody>
          <tr><td>الطلاب والحضور ومتابعة الفصول والفريق</td>{plans.map(plan => <td key={plan.id}>✓</td>)}</tr>
          {featureKeys.map(key => <tr key={key}><td>{featureLabels[key]}</td>{plans.map(plan => <td key={plan.id}>{plan.features.includes(key) ? "✓" : "—"}</td>)}</tr>)}
        </tbody></table></div>
    </section>
  </>;
}
