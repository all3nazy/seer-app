import { notFound } from "next/navigation";
import { SettingsTabs } from "../../../components/settings-tabs";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/**
 * Browser-test page for the settings tabs (the real component, placeholder content), so tabs and old
 * links can be tested without a signed-in account. Exists only when SEER_E2E=1 (Playwright's server).
 */
export default async function SettingsTabsTestPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  if (process.env.SEER_E2E !== "1") notFound();
  const { role } = await searchParams;
  const manager = role !== "staff";
  return <main className="main" style={{ maxWidth: 640, margin: "24px auto" }}>
    <SettingsTabs tabs={[
      { id: "account", label: "حسابي", content: <p>محتوى حسابي</p> },
      ...(manager ? [{ id: "organization" as const, label: "المنشأة", content: <><p>محتوى المنشأة</p><section id="sections"><p>الأقسام</p></section></> }] : []),
      { id: "device", label: "الجهاز والإشعارات", content: <><section id="notify"><p>الإشعارات</p></section><section id="app"><p>التثبيت</p></section></> },
      { id: "help", label: "المساعدة", content: <p>محتوى المساعدة</p> },
    ]} />
  </main>;
}
