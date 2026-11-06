export const assistantTopics = ["branches", "children", "guardians", "enrollments", "invoices", "notifications"] as const;
export type AssistantTopic = typeof assistantTopics[number];
export type AssistantIntent =
  | {kind:"status";topic:AssistantTopic}
  | {kind:"navigate";topic:Exclude<AssistantTopic,"notifications">}
  | {kind:"mutation";topic?:Exclude<AssistantTopic,"notifications">}
  | {kind:"help"}
  | {kind:"support"}
  | {kind:"unknown"};

export const topicNames:Record<AssistantTopic,string> = {
 branches:"الفروع", children:"ملفات الأطفال", guardians:"أولياء الأمور",
 enrollments:"طلبات التسجيل", invoices:"الفواتير", notifications:"المتابعات التشغيلية"
};

export function normalizeArabic(value:string):string {
 return value.toLowerCase().normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g,"").replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").trim();
}

export function classifyIntent(question:string, context?:AssistantTopic):AssistantIntent {
 const q=normalizeArabic(question);
 let topic:AssistantTopic|undefined;
 if(/فاتور|فواتير|سداد|مستحق|مالي|invoice|payment/.test(q)) topic="invoices";
 else if(/تسجيل|قبول|التحاق|طلب|enroll/.test(q)) topic="enrollments";
 else if(/ولي امر|اولياء|ولي الامر|والد|والده|guardian/.test(q)) topic="guardians";
 else if(/فرع|فروع|branch/.test(q)) topic="branches";
 else if(/طفل|اطفال|ملف|child/.test(q)) topic="children";
 else if(/تنبيه|تنبيهات|اشعار|اشعارات|متابعه|متابعات|notification/.test(q)) topic="notifications";
 const operationalTopic=topic && topic!=="notifications" ? topic : undefined;
 // Mutation detection precedes lookup and navigation; no write is ever executed here.
 const mutationWords=/^(?:اضف(?:ها|ه)?|اضافه|انش[ائ](?:ها|ه)?|انشاء|سجل(?:ها|ه|ي)?|احذف(?:ها|ه)?|حذف|امسح(?:ها|ه)?|عدل(?:ها|ه)?|تعديل|حدث(?:ها|ه)?|تحديث|اعتمد(?:ها|ه)?|اعتماد|وافق|ارفض(?:ها|ه)?|سدد(?:ها|ه)?|ادفع(?:ها|ه)?|الغ(?:ها|ه|ي)?|الغاء|ارسل(?:ها|ه)?|ارسال|delete|create|update|approve|reject|pay|send)$/;
 if(q.split(/[\s،؟?!.,؛:]+/).some(word=>mutationWords.test(word))) return {kind:"mutation",topic:operationalTopic??(context!=="notifications"?context:undefined)};
 if(/دعم|واتساب|واتس اب|مشكله|تواصل|support|whatsapp/.test(q)) return {kind:"support"};
 if(operationalTopic && /افتح|اذهب|انتقل|ودني|وديني|رابط|صفحه|open|navigate/.test(q)) return {kind:"navigate",topic:operationalTopic};
 if(topic) return {kind:"status",topic};
 if(context && /حالت|حالات|معلق|انتظار|بانتظار|غير مسدد|المجموع|اجمالي|عددها|كم|وماذا|وماذا عن|والباقي/.test(q)) return {kind:"status",topic:context};
 if(/مساعد|خدمات|تساعد|تقدر|مرحبا|اهلا|كيف|help/.test(q)) return {kind:"help"};
 return {kind:"unknown"};
}

export function operationsLink(organizationId:string, topic?:Exclude<AssistantTopic,"notifications">):string {
 return `/dashboard/operations?org=${encodeURIComponent(organizationId)}${topic?`#${topic}`:""}`;
}
