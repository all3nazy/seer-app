import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { canManage } from "../../../lib/operations";
import type { Task } from "../../../lib/tasks";
import type { Member } from "../../../lib/team";
import { TaskBoard } from "../../../components/task-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "المهام" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ org?: string; q?: string }> }) {
  const client = await createSupabaseServerClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect("/login");
  const { data: memberships, error: membershipError } = await client.from("memberships").select("organization_id,role,organizations(name)").eq("user_id", user.id);
  if (membershipError) return <><h1>تعذر تحميل المنشآت</h1><p role="alert">حاول مجددًا بعد قليل.</p></>;
  const params = await searchParams;
  const member = memberships?.find(item => item.organization_id === params.org) ?? memberships?.[0];
  if (!member) return <section className="card"><h1>لا توجد منشأة مرتبطة</h1><p>اطلب من مسؤول المنصة ربط حسابك بمنشأة.</p></section>;
  const org = member.organization_id as string;
  const name = (member.organizations as unknown as { name: string } | null)?.name ?? "المنشأة";
  // Search is a plain title match; LIKE wildcards typed by the user are escaped.
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  let query = client.from("tasks").select("id,title,notes,status,priority,due_date,completed_at,assignee_id").eq("organization_id", org);
  if (q) query = query.ilike("title", `%${q.replace(/[\\%_]/g, character => `\\${character}`)}%`);
  const { data: tasks, error: tasksError } = await query.order("created_at", { ascending: false }).limit(500);
  // Names only; members never see each other's emails.
  const { data: members } = await client.from("memberships").select("user_id,role,display_name").eq("organization_id", org).order("joined_at");
  return <>
    <header className="page-head">
      <div><h1>المهام</h1><p>{q ? <>نتائج البحث عن «{q}» في {name}. <Link href={`/dashboard/tasks?org=${encodeURIComponent(org)}`}>عرض كل المهام</Link></> : <>سير العمل في {name}: من الفكرة إلى الإنجاز.</>}</p></div>
      {memberships && memberships.length > 1 ? <nav className="segments" aria-label="اختيار المنشأة">
        {memberships.map(item => <Link key={item.organization_id} href={`/dashboard/tasks?org=${encodeURIComponent(item.organization_id)}`} aria-current={item.organization_id === org ? "page" : undefined}>{(item.organizations as unknown as { name: string } | null)?.name ?? "منشأة"}</Link>)}
      </nav> : null}
    </header>
    {tasksError ? <section className="card"><h2>لوحة المهام غير جاهزة بعد</h2><p role="alert">تعذر تحميل المهام. إذا كانت هذه أول مرة، يلزم تطبيق ترحيل قاعدة البيانات الخاص بالمهام.</p></section>
      : <TaskBoard key={`${org}:${q}`} organizationId={org} manager={canManage(member.role)} initialTasks={(tasks ?? []) as Task[]} members={(members ?? []) as Member[]} me={user.id} />}
  </>;
}
