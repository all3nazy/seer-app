import { LegalPage } from "../../components/legal-page";
import { privacy } from "../../lib/legal";

export const metadata = { title: "سياسة الخصوصية", description: "كيف تجمع منصة سِير البيانات الشخصية وتحفظها وتحميها، وحقوق أصحابها." };

export default function PrivacyPage() {
  return <LegalPage doc={privacy} other={{ href: "/terms", label: "شروط الاستخدام" }} />;
}
