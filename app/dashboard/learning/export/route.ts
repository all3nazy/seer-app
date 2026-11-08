import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { toCsv } from "../../../../lib/audit";
import { gradesCsvRows, type Grade } from "../../../../lib/learning";

export const dynamic = "force-dynamic";

/** One assessment's grades as CSV (for Noor or the subject lead). Members of the organization only, through RLS. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const client = await createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { data: assessment } = await client.from("assessments").select("id,title,max_score,section_id,organization_id").eq("id", params.get("assessment") ?? "").maybeSingle();
  if (!assessment) return new NextResponse("Not found", { status: 404 });
  const [students, grades] = await Promise.all([
    client.from("children").select("id,full_name,national_id").eq("organization_id", assessment.organization_id as string).eq("section_id", assessment.section_id as string).order("full_name"),
    client.from("grades").select("assessment_id,child_id,score,absent").eq("assessment_id", assessment.id as string),
  ]);
  const csv = toCsv(gradesCsvRows((students.data ?? []) as { id: string; full_name: string; national_id: string | null }[], (grades.data ?? []) as Grade[], assessment.id as string, Number(assessment.max_score)));
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="grades-${assessment.id}.csv"`, "Cache-Control": "private, no-store" } });
}
