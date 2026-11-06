import type { SupabaseClient } from "@supabase/supabase-js";
import { topicNames, type AssistantTopic } from "./assistant-intents";

const managerRoles=new Set(["owner","admin"]);
const number=new Intl.NumberFormat("ar-SA");

// Only aggregate queries leave this boundary; names and individual records are never loaded.
export async function assistantStatus(client:SupabaseClient, organizationId:string, topic:AssistantTopic):Promise<string> {
 const {data:{user},error:authError}=await client.auth.getUser();
 if(authError || !user) throw new Error("انتهت الجلسة. سجل الدخول من جديد.");
 const {data:membership,error:membershipError}=await client.from("memberships").select("role").eq("organization_id",organizationId).eq("user_id",user.id).maybeSingle();
 if(membershipError || !membership) throw new Error("لا تملك صلاحية الاطلاع على هذه المنشأة.");
 const manager=managerRoles.has(membership.role);
 if(topic==="invoices" && !manager) throw new Error("تفاصيل الفواتير متاحة لمالك المنشأة أو مديرها فقط.");
 const count=async(table:string,status?:string)=>{
  let query=client.from(table).select("id",{count:"exact",head:true}).eq("organization_id",organizationId);
  if(status) query=query.eq("status",status);
  const result=await query;
  if(result.error || result.count===null) throw new Error("تعذر قراءة البيانات. تحقق من الصلاحيات وحاول مجددًا.");
  return number.format(result.count);
 };
 if(topic==="notifications") {
  const pending=await count("enrollments","pending");
  const unpaid=manager?await count("invoices","issued"):null;
  return `متابعات الآن: ${pending} طلبات تسجيل بانتظار الموافقة.${unpaid!==null?` و${unpaid} فواتير صادرة غير مسددة.`:""} هذه متابعة للحالات الحالية؛ لم تُرسل أي إشعارات.`;
 }
 const total=await count(topic);
 if(topic==="invoices") return `إجمالي الفواتير: ${total}، الفواتير الصادرة غير المسددة: ${await count("invoices","issued")}.`;
 if(topic==="enrollments") return `إجمالي طلبات التسجيل: ${total}، قيد الانتظار: ${await count("enrollments","pending")}.`;
 return `عدد ${topicNames[topic]}: ${total}.`;
}
