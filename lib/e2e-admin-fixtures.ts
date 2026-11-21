import type { OrgProfile } from "../components/admin-org-profile";
import type { OverviewData, PendingTransfer } from "../components/admin-overview";
import type { SubscriberRow } from "../components/admin-subscribers";

/** Sample data for the «سِير أدمن» browser-test pages only (SEER_E2E=1); never used by the console. */
const now = Date.parse("2026-11-22T09:00:00Z");
const ago = (minutes: number) => new Date(now - minutes * 60000).toISOString();
export const fixtureNow = now;
export const orgId = "d2000000-0000-0000-0000-0000000000d1";

export const sampleOverview: OverviewData = {
  decisions: { payments: 3, oldest_payment: { organization: "روضة الياسمين", created_at: ago(2 * 1440) }, join_requests: 2, support_waiting: 4, support_over_24h: 1, ending_7_days: 5 },
  numbers: { active: 41, trial: 7, trial_ending_7_days: 3, mrr: 12400, renewal_base: 25, renewal_rate: 92, signed_in_today: 318, users: 520 },
  health: { database: true, cron: [{ job: "seer-subscriptions-daily", status: "succeeded", at: ago(300) }, { job: "seer-telegram-health", status: "succeeded", at: ago(10) }], telegram_links: 1, telegram_failed_today: 0 },
  activity: [
    { kind: "payment", action: "payment_approved", organization: "حضانة النخبة", organization_id: orgId, at: ago(10) },
    { kind: "join", action: "join_request", organization: "روضة المستقبل", detail: "الرياض", at: ago(40) },
    { kind: "audit", action: "login_unlocked", organization: "مدارس رواد الغد", organization_id: orgId, at: ago(60) },
  ],
};
export const samplePending: PendingTransfer[] = [
  { id: "a1000000-0000-0000-0000-000000000001", organization_id: orgId, organization: "روضة الياسمين", plan: "المتقدمة", months: 12, amount: 2400, reference: "RJ-55120", created_at: ago(2 * 1440) },
  { id: "a1000000-0000-0000-0000-000000000002", organization_id: orgId, organization: "مدارس رواد الغد", plan: "الأساسية", months: 1, amount: 350, reference: "AL-90231", created_at: ago(1440) },
];

export const sampleProfile: OrgProfile = {
  organization_id: orgId, name: "روضة الياسمين", type: "kindergarten", city: "الرياض", created_at: "2026-10-03T08:00:00Z", access: "active",
  subscription: { status: "active", starts_on: "2026-10-03", ends_on: "2027-10-03", days_left: 315, plan_id: "b1000000-0000-0000-0000-000000000001", cancelled_at: null, cancel_reason: null },
  plan: { id: "b1000000-0000-0000-0000-000000000001", name: "المتقدمة", monthly_price: 200, features: ["daily", "tasks", "finance", "payroll", "reports", "messages"] },
  grace_days: 7, payment_method: "bank_transfer",
  payments: [{ id: "c1000000-0000-0000-0000-000000000001", plan: "المتقدمة", months: 12, amount: 1920, reference: "RJ-55120", status: "approved", reject_reason: null, receipt_path: `${orgId}/r1.jpg`, created_at: "2026-10-03T08:00:00Z", decided_at: "2026-10-03T09:00:00Z", period_end: "2027-10-03" }],
  members: [
    { user_id: "d1000000-0000-0000-0000-0000000000d1", name: "نورة السبيعي", role: "owner", login: "noura@yasmeen.test", phone: "0551239876", last_sign_in_at: ago(120), locked: false },
    { user_id: "d1000000-0000-0000-0000-0000000000d2", name: "سارة", role: "admin", login: "sara.a@users.seer.local", phone: null, last_sign_in_at: null, locked: false },
    { user_id: "d1000000-0000-0000-0000-0000000000d3", name: "هدى", role: "staff", login: "huda.d@users.seer.local", phone: null, last_sign_in_at: ago(3 * 1440), locked: true },
  ],
  counts: { staff: 14, signed_in_today: 9, guardians: 86, students: 40 },
  entitlements: { blocked: ["online_payments"], disabled: ["transport"] },
  onboarding: { done: 7, total: 10, missing: ["classes", "daily", "portal"], snooze_count: 1, stuck: true, completed_at: null, since: ago(4 * 1440) },
  support: [{ id: "e1000000-0000-0000-0000-000000000001", subject: "كيف أضيف معلمة؟", status: "closed", last_sender: "admin", last_message_at: ago(1440) },
    { id: "e1000000-0000-0000-0000-000000000002", subject: "الفاتورة ما تطلع لولي الأمر", status: "open", last_sender: "user", last_message_at: ago(90) }],
  log: [{ action: "org_extended", detail: {}, created_at: ago(30) }, { action: "note_saved", detail: {}, created_at: ago(3000) }],
  note: { body: "تواصلنا معهم في معرض الرياض.", updated_at: ago(3000) },
};

export const sampleRows: SubscriberRow[] = Array.from({ length: 25 }, (_, index) => ({
  organization_id: `f${String(index).padStart(7, "0")}-0000-0000-0000-000000000000`, name: index ? `منشأة ${index + 1}` : "روضة الياسمين", type: index % 2 ? "school" : "kindergarten", city: "الرياض",
  plan: "المتقدمة", status: index % 5 === 0 ? "trial" : "active", access: index % 7 === 0 ? "grace" : "active", ends_on: "2026-12-01", days_left: 9,
  owner_email: `owner${index}@school.test`, owner_phone: "0551239876", students: 40 + index, staff: 10, pending: index === 0 ? 1 : 0, total: 60,
}));
