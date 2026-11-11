"use client";
import { useActionState, useTransition } from "react";
import { linkGuardian, unlinkGuardian } from "../app/dashboard/operations/actions";
import { relationshipLabels, relationships, type Relationship } from "../lib/team";
import type { RecordOption } from "../lib/operations";
import { notify } from "./feedback";
import { confirmAction } from "./confirm";

export type FamilyLink = { child_id: string; guardian_id: string; relationship: Relationship };
type Props = { organizationId: string; manager: boolean; childrenOptions: RecordOption[]; guardians: RecordOption[]; links: FamilyLink[] };

export function FamilyLinks({ organizationId, manager, childrenOptions, guardians, links }: Props) {
  const [state, action, pending] = useActionState(linkGuardian, {});
  const [removing, start] = useTransition();
  const name = (options: RecordOption[], id: string) => options.find(option => option.id === id)?.name ?? "سجل خارج القائمة";
  async function unlink(link: FamilyLink) {
    if (!(await confirmAction(`إلغاء ربط ${name(childrenOptions, link.child_id)} بـ${name(guardians, link.guardian_id)}؟`))) return;
    start(async () => {
      const result = await unlinkGuardian(organizationId, link.child_id, link.guardian_id);
      notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info");
    });
  }
  return <section className="card" style={{ marginTop: 24 }} aria-labelledby="family-title">
    <h2 id="family-title">أولياء أمور الأطفال</h2>
    {links.length ? <table className="links-table">
      <thead><tr><th scope="col">الطفل</th><th scope="col">ولي الأمر</th><th scope="col">الصلة</th>{manager ? <th scope="col"><span className="sr-only">إجراء</span></th> : null}</tr></thead>
      <tbody>{links.map(link => <tr key={`${link.child_id}:${link.guardian_id}`}>
        <td>{name(childrenOptions, link.child_id)}</td><td>{name(guardians, link.guardian_id)}</td><td><span className="chip-soft">{relationshipLabels[link.relationship] ?? link.relationship}</span></td>
        {manager ? <td><button type="button" className="btn btn-sm btn-danger" disabled={removing} onClick={() => unlink(link)} aria-label={`إلغاء ربط ${name(childrenOptions, link.child_id)} بـ${name(guardians, link.guardian_id)}`}>إلغاء الربط</button></td> : null}
      </tr>)}</tbody>
    </table> : <p className="hint">ما فيه أطفال مربوطين بأولياء أمورهم بعد.</p>}
    {manager ? (childrenOptions.length && guardians.length ? <form action={action} className="composer" style={{ marginTop: 16 }} aria-label="ربط طفل بولي أمره">
      <input type="hidden" name="organization_id" value={organizationId} />
      <label>الطفل<select name="child_id" required defaultValue=""><option value="" disabled>اختر الطفل</option>{childrenOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
      <label>ولي الأمر<select name="guardian_id" required defaultValue=""><option value="" disabled>اختر ولي الأمر</option>{guardians.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
      <label>الصلة<select name="relationship" defaultValue="father">{relationships.map(item => <option key={item} value={item}>{relationshipLabels[item]}</option>)}</select></label>
      <button type="submit" className="btn-primary" disabled={pending}>{pending ? "جارٍ الربط…" : "ربط"}</button>
      {state.error ? <p role="alert" style={{ gridColumn: "1/-1" }}>{state.error}</p> : null}
      {state.success ? <p role="status" style={{ gridColumn: "1/-1" }}>{state.success}</p> : null}
    </form> : <p className="hint" style={{ marginTop: 12 }}>أضف طفلًا من هذا القسم وولي أمر من قسم أولياء الأمور، وبعدها تقدر تربطهم هنا.</p>) : null}
  </section>;
}
