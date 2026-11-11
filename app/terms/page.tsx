import { LegalPage } from "../../components/legal-page";
import { terms } from "../../lib/legal";

export const metadata = { title: "شروط الاستخدام", description: "شروط استخدام منصة سِير خلال المرحلة التجريبية، وملحق معالجة البيانات." };

export default function TermsPage() {
  return <LegalPage doc={terms} other={{ href: "/privacy", label: "سياسة الخصوصية" }} />;
}
