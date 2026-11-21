import type { AuditRow, BroadcastRow, InvoiceDoc, InvoiceRow, SecurityData, TeamRow, CouponUse } from "../components/admin-stage3-views";
import type { Coupon } from "./admin-stage3";
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

// Stage 3 ---------------------------------------------------------------------------------------------
export const stagePlans = [{ id: "b1000000-0000-0000-0000-000000000001", name: "المتقدمة" }, { id: "b1000000-0000-0000-0000-000000000002", name: "الأساسية" }];
export const sampleCoupons: Coupon[] = [
  { id: "c3000000-0000-0000-0000-000000000001", code: "RAMADAN20", kind: "percent", value: 20, plan_ids: [], months: [12], valid_from: "2026-11-01", valid_until: "2026-12-31", max_uses: 50, max_per_org: 1,
    first_payment_only: false, note: "عرض رمضان للسنوي", is_active: true, created_at: "2026-11-01T08:00:00Z", used: 3, pending: 1, discount_total: 2874.24 },
  { id: "c3000000-0000-0000-0000-000000000002", code: "FIRST100", kind: "fixed", value: 100, plan_ids: ["b1000000-0000-0000-0000-000000000001"], months: [], valid_from: null, valid_until: null, max_uses: null, max_per_org: 1,
    first_payment_only: true, note: null, is_active: false, created_at: "2026-10-01T08:00:00Z", used: 0, pending: 0, discount_total: 0 },
];
export const sampleCouponUses: CouponUse[] = [
  { payment_id: "c4000000-0000-0000-0000-000000000001", organization_id: orgId, organization: "روضة الياسمين", status: "approved", amount: 3832.32, discount: 958.08, created_at: "2026-11-10T08:00:00Z", receipt: "SEER-2026-00012" },
];
export const sampleInvoices: InvoiceRow[] = [
  { id: "c5000000-0000-0000-0000-000000000001", number: "SEER-2026-00013", kind: "adjustment", organization_id: orgId, organization: "روضة الياسمين", description: "تسوية فرق الترقية", amount: 150.5, discount: 0, coupon_code: null, issued_at: "2026-11-18T08:00:00Z", total: 2 },
  { id: "c5000000-0000-0000-0000-000000000002", number: "SEER-2026-00012", kind: "receipt", organization_id: orgId, organization: "روضة الياسمين", description: "اشتراك منصة سِير — المتقدمة", amount: 3832.32, discount: 958.08, coupon_code: "RAMADAN20", issued_at: "2026-11-10T09:00:00Z", total: 2 },
];
export const sampleInvoiceDoc: InvoiceDoc = { id: "c5000000-0000-0000-0000-000000000002", number: "SEER-2026-00012", kind: "receipt", organization_name: "روضة الياسمين", description: "اشتراك منصة سِير — المتقدمة",
  plan_name: "المتقدمة", months: 12, period_start: "2026-11-10", period_end: "2027-11-10", base_amount: 4790.4, discount: 958.08, coupon_code: "RAMADAN20", amount: 3832.32, reference: "TR-88120", note: null, issued_at: "2026-11-10T09:00:00Z" };
export const sampleBroadcasts: BroadcastRow[] = [
  { id: "c6000000-0000-0000-0000-000000000001", title: "صيانة مجدولة", body: "المنصة تتوقف ١٠ دقائق الساعة ٢ فجرًا.", link: null, audience: { status: "all", plan: null, orgs: [] }, managers: true, email: true,
    organizations: 41, notified: 63, emailed: 38, created_at: "2026-11-20T18:00:00Z", created_by: "admin@seer.test" },
];
export const sampleSecurity: SecurityData = {
  window: "24h", failures: 37, successes: 412,
  locks: [{ id: 7, scope: "account", subject: "la***@nakheel.test", ip: "10.7.7.7", failures: 5, locked_until: "2026-11-21T12:10:00Z", created_at: "2026-11-21T11:55:00Z", active: true },
    { id: 6, scope: "ip", subject: "203.0.113.9", ip: "203.0.113.9", failures: 15, locked_until: "2026-11-21T06:00:00Z", created_at: "2026-11-21T05:30:00Z", active: false }],
  top_ips: [{ ip: "203.0.113.9", failures: 22, accounts: 7, last_at: "2026-11-21T11:40:00Z", blocked: false }, { ip: "198.51.100.20", failures: 9, accounts: 1, last_at: "2026-11-21T10:00:00Z", blocked: true }],
  blocks: [{ id: 3, ip: "198.51.100.0/24", reason: "شبكة مزعجة", expires_at: "2026-11-28T10:00:00Z", created_at: "2026-11-21T10:00:00Z", by: "admin@seer.test", active: true, removed_at: null }],
};
export const sampleAudit: AuditRow[] = [
  { id: 30, created_at: "2026-11-21T11:00:00Z", actor_id: "60000000-0000-0000-0000-0000000000ad", actor: "admin@seer.test", action: "coupon_created", organization_id: null, organization: null, detail: { code: "RAMADAN20", value: 20 }, total: 2 },
  { id: 29, created_at: "2026-11-21T10:00:00Z", actor_id: "60000000-0000-0000-0000-0000000000ad", actor: "admin@seer.test", action: "org_extended", organization_id: orgId, organization: "روضة الياسمين", detail: { amount: 1, unit: "months" }, total: 2 },
];
export const sampleTeam: TeamRow[] = [
  { user_id: "60000000-0000-0000-0000-0000000000ad", email: "admin@seer.test", role: "owner", created_at: "2026-10-01T00:00:00Z", last_sign_in_at: "2026-11-21T11:30:00Z", mfa: true, invited_by: null, is_me: true },
  { user_id: "60000000-0000-0000-0000-0000000003b5", email: "help@seer.test", role: "support", created_at: "2026-11-01T00:00:00Z", last_sign_in_at: null, mfa: false, invited_by: "admin@seer.test", is_me: false },
];
