import Link from "next/link";
import { notFound } from "next/navigation";
import { loadOrgContext } from "../../../../lib/org-context";
import { OrgUnavailable } from "../../../../components/org-unavailable";
import { StudentHealthForm, StudentProfileForm } from "../../../../components/student-forms";
import { FamilyLinks, type FamilyLink } from "../../../../components/family-links";
import { statusLabels, uuid } from "../../../../lib/operations";
import { age, attendanceLabels, attendanceStatuses, attendanceTone, genderLabels, isAttendanceStatus, riyadhToday, type ChildHealth, type ChildProfile } from "../../../../lib/students";
import { relationshipLabels, type Relationship } from "../../../../lib/team";
import { sectionLabel } from "../../../../lib/academics";
import { AuthorizedPickupForm, AuthorizedToggle } from "../../../../components/pickup-forms";
import { PortalLinkButton } from "../../../../components/family-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "ملف الطالب" };

function Field({ label, value, ltr }: { label: string; value: string | null | undefined; ltr?: boolean }) {
  return <div><dt className="hint">{label}</dt><dd style={{ margin: "2px 0 0", fontWeight: 500 }} dir={ltr && value ? "ltr" : undefined}>{value || "—"}</dd></div>;
}

export default async function StudentFile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ org?: string }> }) {
  const [{ id: rawId }, { org: requestedOrg }] = await Promise.all([params, searchParams]);
  let id: string;
  try { id = uuid(rawId); } catch { notFound(); }
  const context = await loadOrgContext(requestedOrg);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager } = context;
  const { data: child, error } = await client.from("children").select("id,full_name,date_of_birth,gender,national_id,branch_id,notes,created_at,section_id,photo_consent,photo_consent_at").eq("organization_id", org).eq("id", id).maybeSingle();
  if (error) return <section className="card"><h1>تعذر تحميل ملف الطالب</h1><p role="alert">أعد تحميل الصفحة أو حاول لاحقًا.</p></section>;
  if (!child) notFound();
  const profile = child as ChildProfile;
  const since = new Date(Date.parse(riyadhToday()) - 29 * 86400_000).toISOString().slice(0, 10);
  const [branchesResult, healthResult, linksResult, guardiansResult, enrollmentsResult, attendanceResult, sectionsResult, gradesResult] = await Promise.all([
    client.from("branches").select("id,name").eq("organization_id", org).order("name").limit(200),
    client.from("child_health").select("blood_type,allergies,conditions,medications,emergency_name,emergency_phone,notes,updated_at").eq("organization_id", org).eq("child_id", id).maybeSingle(),
    client.from("child_guardians").select("child_id,guardian_id,relationship").eq("organization_id", org).eq("child_id", id),
    client.from("guardians").select("id,full_name,phone").eq("organization_id", org).order("full_name").limit(500),
    client.from("enrollments").select("id,branch_id,status,created_at").eq("organization_id", org).eq("child_id", id).order("created_at", { ascending: false }),
    client.from("attendance").select("attendance_date,status,note").eq("organization_id", org).eq("child_id", id).gte("attendance_date", since).order("attendance_date", { ascending: false }),
    client.from("sections").select("id,name,grade_level_id").eq("organization_id", org).order("name"),
    client.from("grade_levels").select("id,name").eq("organization_id", org).order("sort_order"),
  ]);
  const { data: authorizedData } = await client.from("authorized_pickups").select("id,full_name,relationship,phone,national_id,is_active").eq("organization_id", org).eq("child_id", id).order("created_at");
  const authorizedRows = (authorizedData ?? []) as { id: string; full_name: string; relationship: string; phone: string | null; national_id: string | null; is_active: boolean }[];
  const grades = (gradesResult.data ?? []) as { id: string; name: string }[];
  const sections = ((sectionsResult.data ?? []) as { id: string; name: string; grade_level_id: string }[]).map(item => ({ id: item.id, name: sectionLabel(item, grades) }));
  const sectionName = sections.find(item => item.id === profile.section_id)?.name ?? null;
  const branches = (branchesResult.data ?? []) as { id: string; name: string }[];
  const branchName = (value: string | null) => branches.find(item => item.id === value)?.name ?? null;
  const health = (healthResult.data ?? null) as ChildHealth | null;
  const links = (linksResult.data ?? []) as FamilyLink[];
  const guardians = (guardiansResult.data ?? []) as { id: string; full_name: string; phone: string | null }[];
  const attendance = (attendanceResult.data ?? []) as { attendance_date: string; status: string; note: string | null }[];
  const counts = attendanceStatuses.map(status => ({ status, count: attendance.filter(row => row.status === status).length }));
  const presentDays = attendance.filter(row => row.status === "present" || row.status === "late").length;
  const orgQuery = `?org=${encodeURIComponent(org)}`;
  return <div style={{ display: "grid", gap: 24 }}>
    <header className="page-head" style={{ marginBottom: 0 }}>
      <div>
        <p className="hint"><Link href={`/dashboard/children${orgQuery}`}>الطلاب</Link> / ملف الطالب</p>
        <h1>{profile.full_name}</h1>
        <p>{[age(profile.date_of_birth), profile.gender === "male" || profile.gender === "female" ? genderLabels[profile.gender] : null, sectionName, branchName(profile.branch_id)].filter(Boolean).join(" · ") || "أكمل بيانات الطالب من الأسفل."}</p>
      </div>
    </header>

    {health?.allergies || health?.conditions ? <p className="info-banner" role="note"><strong>تنبيه صحي:</strong>&nbsp;{[health.allergies && `حساسية: ${health.allergies}`, health.conditions && `حالات: ${health.conditions}`].filter(Boolean).join(" — ")}</p> : null}

    <section className="card" aria-labelledby="basic-title">
      <h2 id="basic-title">البيانات الأساسية</h2>
      <dl className="field-row" style={{ margin: "12px 0 0" }}>
        <Field label="تاريخ الميلاد" value={profile.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString("ar-SA", { timeZone: "UTC" }) : null} />
        <Field label="رقم الهوية أو الإقامة" value={profile.national_id} ltr />
        <Field label="الفرع" value={branchName(profile.branch_id)} />
        <Field label="الشعبة" value={sectionName} />
        <Field label="الموافقة على التصوير" value={profile.photo_consent ? `موافق${profile.photo_consent_at ? ` منذ ${new Date(profile.photo_consent_at).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" })}` : ""}` : "غير موافق"} />
      </dl>
      {profile.notes ? <p style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{profile.notes}</p> : null}
      {manager ? <details className="desktop-only" style={{ marginTop: 16 }}><summary>تعديل البيانات</summary><div style={{ marginTop: 12 }}><StudentProfileForm organizationId={org} branches={branches} sections={sections} child={profile} /></div></details> : null}
    </section>

    <section className="card" aria-labelledby="guardians-title">
      <h2 id="guardians-title">أولياء الأمور</h2>
      {links.length ? <ul className="records">{links.map(link => {
        const guardian = guardians.find(item => item.id === link.guardian_id);
        return <li key={link.guardian_id}><span>{guardian?.full_name ?? "ولي أمر"} <span className="chip-soft">{relationshipLabels[link.relationship as Relationship] ?? link.relationship}</span></span>
          <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{guardian?.phone ? <a href={`tel:${guardian.phone}`} dir="ltr">{guardian.phone}</a> : null}
            {manager && guardian ? <PortalLinkButton guardianId={guardian.id} guardianName={guardian.full_name} phone={guardian.phone} organization={orgName} /> : null}</span></li>;
      })}</ul> : <p className="hint">ما فيه ولي أمر مربوط بهذا الطالب.</p>}
      {manager ? <details className="desktop-only" style={{ marginTop: 12 }}><summary>ربط ولي أمر أو إلغاء ربط</summary>
        <FamilyLinks organizationId={org} manager childrenOptions={[{ id, name: profile.full_name }]} guardians={guardians.map(item => ({ id: item.id, name: item.full_name }))} links={links} />
      </details> : null}
    </section>

    <section className="card" aria-labelledby="pickup-title">
      <h2 id="pickup-title">المصرّح لهم باستلام الطالب</h2>
      <p className="hint" style={{ marginBottom: 12 }}>أولياء الأمور المربوطين يقدرون يستلمون دائمًا. أضف هنا غيرهم، مثل الجد أو السائق.</p>
      {authorizedRows.length ? <ul className="records">{authorizedRows.map(item => <li key={item.id}>
        <span><strong>{item.full_name}</strong> <span className="chip-soft">{item.relationship}</span>{item.is_active ? null : <span className="chip-soft rose" style={{ marginInlineStart: 6 }}>موقوف</span>}
          <span className="hint" style={{ display: "block" }} dir="ltr">{[item.phone, item.national_id].filter(Boolean).join(" · ")}</span></span>
        {manager ? <span className="desktop-only"><AuthorizedToggle organizationId={org} childId={id} id={item.id} active={item.is_active} /></span> : null}
      </li>)}</ul> : <p className="hint">ما فيه أشخاص مضافين.</p>}
      {manager ? <details className="desktop-only" style={{ marginTop: 12 }}><summary>إضافة شخص مصرّح له</summary><div style={{ marginTop: 12 }}><AuthorizedPickupForm organizationId={org} childId={id} /></div></details> : null}
    </section>
    <section className="card" aria-labelledby="health-title">
      <h2 id="health-title">الملف الصحي</h2>
      {healthResult.error ? <p role="alert">تعذر تحميل الملف الصحي.</p> : <>
        <dl className="field-row" style={{ margin: "12px 0 0" }}>
          <Field label="فصيلة الدم" value={health?.blood_type} ltr />
          <Field label="جهة الطوارئ" value={health?.emergency_name} />
          <Field label="رقم الطوارئ" value={health?.emergency_phone} ltr />
        </dl>
        <dl style={{ display: "grid", gap: 12, margin: "12px 0 0" }}>
          <Field label="الحساسية" value={health?.allergies} />
          <Field label="حالات صحية مزمنة" value={health?.conditions} />
          <Field label="الأدوية" value={health?.medications} />
          <Field label="ملاحظات صحية" value={health?.notes} />
        </dl>
        {health ? <p className="hint" style={{ marginTop: 8 }}>آخر تحديث: {new Date(health.updated_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</p> : null}
        {manager ? <details className="desktop-only" style={{ marginTop: 16 }}><summary>{health ? "تحديث الملف الصحي" : "إضافة الملف الصحي"}</summary><div style={{ marginTop: 12 }}><StudentHealthForm organizationId={org} childId={id} health={health} /></div></details> : null}
      </>}
    </section>

    <section className="card" aria-labelledby="attendance-title">
      <h2 id="attendance-title">الحضور في آخر ٣٠ يومًا</h2>
      {attendanceResult.error ? <p role="alert">تعذر تحميل الحضور.</p> : attendance.length ? <>
        <p>نسبة الحضور: <strong>{Math.round(presentDays / attendance.length * 100).toLocaleString("ar-SA")}٪</strong> من {attendance.length.toLocaleString("ar-SA")} يوم مسجّل</p>
        <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{counts.filter(item => item.count).map(item => <span key={item.status} className={`chip-soft ${attendanceTone[item.status]}`}>{attendanceLabels[item.status]}: {item.count.toLocaleString("ar-SA")}</span>)}</p>
        <ul className="records">{attendance.slice(0, 10).map(row => <li key={row.attendance_date}>
          <span>{new Date(row.attendance_date).toLocaleDateString("ar-SA", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })}{row.note ? ` — ${row.note}` : ""}</span>
          {isAttendanceStatus(row.status) ? <span className={`chip-soft ${attendanceTone[row.status]}`}>{attendanceLabels[row.status]}</span> : null}
        </li>)}</ul>
      </> : <p className="hint">ما فيه حضور مسجّل في آخر ٣٠ يومًا.</p>}
      <p style={{ marginTop: 12 }}><Link href={`/dashboard/attendance${orgQuery}`}>فتح كشف الحضور</Link></p>
    </section>

    <section className="card" aria-labelledby="enrollment-title">
      <h2 id="enrollment-title">التسجيل</h2>
      {enrollmentsResult.data?.length ? <ul className="records">{enrollmentsResult.data.map(item => <li key={item.id}>
        <span>{branchName(item.branch_id) ?? "بدون فرع"} — {new Date(item.created_at).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" })}</span>
        <span className="pill">{statusLabels[item.status] ?? item.status}</span>
      </li>)}</ul> : <p className="hint">ما فيه طلبات تسجيل لهذا الطالب.</p>}
      {manager ? <p style={{ marginTop: 12 }}><Link href={`/dashboard/operations?org=${encodeURIComponent(org)}&entity=enrollments`}>إدارة التسجيل</Link></p> : null}
      <p style={{ marginTop: 8 }}><Link href={`/dashboard/learning/report?org=${encodeURIComponent(org)}&child=${id}`}>الشهادة والدرجات</Link></p>
    </section>
  </div>;
}
