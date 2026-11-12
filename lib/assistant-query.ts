import type { SupabaseClient } from "@supabase/supabase-js";
import { topicNames, type AssistantTopic } from "./assistant-intents";
import { riyadhToday } from "./tasks";
import { arNumber } from "./dates";

const managerRoles=new Set(["owner","admin"]);
const number={ format: (value: number) => arNumber(value) };

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
 const tasks=async(filter:"open"|"overdue"|"today"|"doing")=>{
  const today=riyadhToday();
  let query=client.from("tasks").select("id",{count:"exact",head:true}).eq("organization_id",organizationId);
  if(filter==="doing") query=query.eq("status","doing");
  else {
   query=query.neq("status","done");
   if(filter==="overdue") query=query.lt("due_date",today);
   if(filter==="today") query=query.eq("due_date",today);
  }
  const result=await query;
  if(result.error || result.count===null) throw new Error("تعذر قراءة المهام. تحقق من الصلاحيات وحاول مجددًا.");
  return result.count;
 };
 if(topic==="tasks") {
  const [open,doing,overdue,today]=await Promise.all([tasks("open"),tasks("doing"),tasks("overdue"),tasks("today")]);
  if(!open) return "ما عندك مهام مفتوحة الآن. كل شيء منجز.";
  const parts=[`عندك ${number.format(open)} مهام مفتوحة، منها ${number.format(doing)} قيد التنفيذ.`];
  if(overdue) parts.push(`انتبه: ${number.format(overdue)} متأخرة عن موعدها.`);
  if(today) parts.push(`و${number.format(today)} موعد تسليمها اليوم.`);
  if(!overdue && !today) parts.push("لا شيء متأخر ولا مستحق اليوم.");
  return parts.join(" ");
 }
 if(topic==="notifications") {
  const pendingResult=manager?await client.from("applications").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).in("status",["new","reviewing"]):{count:0,error:null};
  const pending=number.format(pendingResult.count??0);
  const unpaid=manager?await count("invoices","issued"):null;
  const late=await tasks("overdue");
  return `متابعات الآن: ${pending} طلبات التحاق جديدة أو قيد المراجعة.${unpaid!==null?` و${unpaid} فواتير صادرة غير مسددة.`:""}${late?` و${number.format(late)} مهام متأخرة.`:""} وللصورة الكاملة قل «ملخص اليوم».`;
 }
 const total=await count(topic);
 if(topic==="invoices") return `إجمالي الفواتير: ${total}، الفواتير الصادرة غير المسددة: ${await count("invoices","issued")}.`;
 if(topic==="enrollments") return `إجمالي طلبات التسجيل: ${total}، قيد الانتظار: ${await count("enrollments","pending")}.`;
 return `عدد ${topicNames[topic]}: ${total}.`;
}
