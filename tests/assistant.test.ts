import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyIntent, normalizeArabic, operationsLink } from "../lib/assistant-intents";
import { assistantStatus } from "../lib/assistant-query";
import { supportLink } from "../lib/support";

describe("Arabic assistant intents",()=>{
 it.each([
  ["كم عدد الفروع؟",{kind:"status",topic:"branches"}],
  ["كم طفل مسجل؟",{kind:"status",topic:"children"}],
  ["عدد أولياء الأمور",{kind:"status",topic:"guardians"}],
  ["كم طلب تسجيل بانتظار الموافقة؟",{kind:"status",topic:"enrollments"}],
  ["كم طلبًا بانتظار الموافقة؟",{kind:"status",topic:"enrollments"}],
  ["أرسل إشعارات لأولياء الأمور",{kind:"mutation",topic:"guardians"}],
  ["الفواتير غير المسددة",{kind:"status",topic:"invoices"}],
  ["المتابعات التشغيلية",{kind:"status",topic:"notifications"}],
  ["افتح صفحة الفروع",{kind:"navigate",topic:"branches"}],
  ["انتقل إلى الفواتير",{kind:"navigate",topic:"invoices"}],
  ["أضف طفلًا",{kind:"mutation",topic:"children"}],
  ["احذف الفواتير",{kind:"mutation",topic:"invoices"}],
  ["اعتمد طلب التسجيل",{kind:"mutation",topic:"enrollments"}],
  ["سدد الفاتورة",{kind:"mutation",topic:"invoices"}],
  ["التواصل مع الدعم",{kind:"support"}],
  ["help",{kind:"help"}],
  ["طقس اليوم",{kind:"unknown"}],
  ["كم مهمة متأخرة؟",{kind:"status",topic:"tasks"}],
  ["وش عندي اليوم",{kind:"status",topic:"tasks"}],
  ["افتح المهام",{kind:"navigate",topic:"tasks"}],
  ["أضف مهمة جديدة",{kind:"mutation",topic:"tasks"}],
  ["الفواتير المتأخرة",{kind:"status",topic:"invoices"}],
 ])("classifies %s safely",(question,intent)=>expect(classifyIntent(question)).toEqual(intent));
 it("normalizes Arabic diacritics without changing the original question",()=>{
  expect(normalizeArabic("أَطْفَالٌ")).toBe("اطفال");
  expect(classifyIntent("أَطْفَالٌ")).toEqual({kind:"status",topic:"children"});
 });
 it("limits contextual follow ups to an established topic",()=>{
  expect(classifyIntent("وكم عددها؟","enrollments")).toEqual({kind:"status",topic:"enrollments"});
  expect(classifyIntent("وكم عددها؟")).toEqual({kind:"unknown"});
  expect(classifyIntent("احذفها","invoices").kind).toBe("mutation");
 });
 it("encodes navigation parameters and keeps destinations local",()=>{
  expect(operationsLink("a&next=https://bad.test","children")).toBe("/dashboard/operations?org=a%26next%3Dhttps%3A%2F%2Fbad.test#children");
 });
});

describe("support privacy",()=>{
 it.each(["","0501234567","+966501234567","123","966 501234567","966501234567?text=private"])("rejects invalid destination %s",phone=>expect(supportLink(phone)).toBeNull());
 it("uses only a fixed generic message",()=>{
  const url=new URL(supportLink("966501234567")!);
  expect(url.origin).toBe("https://wa.me");
  expect(url.searchParams.get("text")).toBe("مرحبًا دعم سِير، أحتاج مساعدة في استخدام المنصة.");
 });
});

type Calls={table:string;columns?:string;filters:Record<string,unknown>;options?:unknown}[];
function fakeClient({role="owner",authenticated=true,member=true,fail=false}:{role?:string;authenticated?:boolean;member?:boolean;fail?:boolean}={}) {
 const calls:Calls=[];
 const client={
  auth:{getUser:async()=>({data:{user:authenticated?{id:"user-a"}:null},error:null})},
  from(table:string){
   const call:Calls[number]={table,filters:{}};calls.push(call);
   const builder={
    select(columns:string,options:unknown){call.columns=columns;call.options=options;return builder;},
    eq(key:string,value:unknown){call.filters[key]=value;return builder;},
    neq(key:string,value:unknown){call.filters[`${key}!=`]=value;return builder;},
    lt(key:string,value:unknown){call.filters[`${key}<`]=value;return builder;},
    maybeSingle:async()=>({data:member?{role}:null,error:null}),
    then<TResult1 = {count:number|null;error:unknown}, TResult2 = never>(resolve?:(value:{count:number|null;error:unknown})=>TResult1|PromiseLike<TResult1>,reject?:(reason:unknown)=>TResult2|PromiseLike<TResult2>){return Promise.resolve({count:fail?null:3,error:fail?new Error("private failure detail"):null}).then(resolve,reject);}
   };return builder;
  }
 } as unknown as SupabaseClient;
 return {client,calls};
}

describe("assistant authorization and aggregate queries",()=>{
 it("rejects missing sessions before loading any data",async()=>{
  const {client,calls}=fakeClient({authenticated:false});
  await expect(assistantStatus(client,"org-a","children")).rejects.toThrow("انتهت الجلسة");
  expect(calls).toHaveLength(0);
 });
 it("rejects users outside the selected tenant",async()=>{
  const {client,calls}=fakeClient({member:false});
  await expect(assistantStatus(client,"org-b","children")).rejects.toThrow("لا تملك صلاحية");
  expect(calls).toHaveLength(1);
  expect(calls[0].filters).toEqual({organization_id:"org-b",user_id:"user-a"});
 });
 it("blocks staff invoice queries before reading invoice data",async()=>{
  const {client,calls}=fakeClient({role:"staff"});
  await expect(assistantStatus(client,"org-a","invoices")).rejects.toThrow("لمالك المنشأة أو مديرها");
  expect(calls.map(call=>call.table)).toEqual(["memberships"]);
 });
 it("does not query financial alerts for staff",async()=>{
  const {client,calls}=fakeClient({role:"staff"});
  const text=await assistantStatus(client,"org-a","notifications");
  expect(text).toContain("ملخص اليوم");
  expect(calls.map(call=>call.table)).toEqual(["memberships","tasks"]);
  expect(calls[1].filters).toMatchObject({organization_id:"org-a","status!=":"done"});
 });
 it("loads aggregate financial states for managers and scopes every query",async()=>{
  const {client,calls}=fakeClient({role:"admin"});
  await expect(assistantStatus(client,"org-a","invoices")).resolves.toContain("الصادرة غير المسددة");
  expect(calls.map(call=>call.table)).toEqual(["memberships","invoices","invoices"]);
  for(const call of calls) expect(call.filters.organization_id).toBe("org-a");
  for(const call of calls.slice(1)) {expect(call.columns).toBe("id");expect(call.options).toEqual({head:true,count:"exact"});}
  expect(calls[2].filters.status).toBe("issued");
 });
 it("summarizes tasks for any member with tenant-scoped aggregate counts only",async()=>{
  const {client,calls}=fakeClient({role:"staff"});
  await expect(assistantStatus(client,"org-a","tasks")).resolves.toContain("مهام مفتوحة");
  expect(calls.map(call=>call.table)).toEqual(["memberships","tasks","tasks","tasks","tasks"]);
  for(const call of calls.slice(1)) {expect(call.filters.organization_id).toBe("org-a");expect(call.options).toEqual({head:true,count:"exact"});}
 });
 it("links task questions to the board, not the records page",()=>{
  expect(operationsLink("org-a","tasks")).toBe("/dashboard/tasks?org=org-a");
 });
 it("returns a safe failure rather than treating a failed count as zero",async()=>{
  const {client}=fakeClient({fail:true});
  await expect(assistantStatus(client,"org-a","children")).rejects.toThrow("تعذر قراءة البيانات");
 });
});
