import { requestSession } from "../../../lib/supabase/server";
import { DurationRow, PlanForm } from "../../../components/admin-forms";

export const metadata = { title: "الباقات والأسعار" };
type PlanRow = { id: string; key: string; name: string; description: string | null; features: string[]; monthly_price: number; sort_order: number; is_active: boolean };

export default async function AdminPlans() {
  const { client } = await requestSession();
  const [plans, durations] = await Promise.all([
    client.from("plans").select("id,key,name,description,features,monthly_price,sort_order,is_active").order("sort_order"),
    client.from("plan_durations").select("months,discount_percent,is_active").order("months"),
  ]);
  return <>
    <header className="page-head"><div><h1>الباقات والأسعار</h1><p>التعديلات تظهر مباشرة في صفحة الأسعار وللتجديد. المبالغ تُحسب دائمًا من هنا في قاعدة البيانات.</p></div></header>
    {((plans.data ?? []) as PlanRow[]).map(plan => <section key={plan.id} className="card" style={{ marginBottom: 16 }}><h2>{plan.name} <span className="hint" dir="ltr">({plan.key})</span></h2><PlanForm plan={plan} /></section>)}
    <section className="card" style={{ marginBottom: 16 }}><h2>إضافة باقة</h2><PlanForm /></section>
    <section className="card"><h2>المدد والخصومات</h2>
      <table className="links-table"><thead><tr><th>المدة</th><th>الخصم</th><th>مفعّلة</th><th></th></tr></thead>
        <tbody>{((durations.data ?? []) as { months: number; discount_percent: number; is_active: boolean }[]).map(row => <DurationRow key={row.months} months={row.months} discount={row.discount_percent} active={row.is_active} />)}</tbody></table>
    </section>
  </>;
}
