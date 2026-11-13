import { notFound } from "next/navigation";
import { AppShell } from "../../../components/app-shell";

/** The shell stays mounted between the test steps, as the dashboard layout does. */
export default function OnboardingTestLayout({ children }: { children: React.ReactNode }) {
  if (process.env.SEER_E2E !== "1") notFound();
  return <AppShell stage="kindergarten" organizations={[{ id: "e2e-org", name: "روضة الاختبار" }]}>{children}</AppShell>;
}
