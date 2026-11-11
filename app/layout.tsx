import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "@fontsource-variable/alexandria/wght.css";
import "./globals.css";
import { iconCookie, iconFiles, parseIconChoice } from "../lib/app-icons";
import { InstallRegistrar } from "../components/install-app";
import { ErrorWatch } from "../components/error-watch";
import { ConfirmLayer } from "../components/confirm";

const description = "منصة عربية لإدارة عمليات المدارس الأهلية والحضانات: المهام والسجلات والمساعد في مكان واحد.";
/** Icons follow the person's choice in Settings (a cookie), so the installed app shows it too. */
export async function generateMetadata(): Promise<Metadata> {
  const { choice } = parseIconChoice((await cookies()).get(iconCookie)?.value);
  const files = iconFiles(choice);
  return {
    title: { default: "سِير", template: "%s | سِير" },
    description,
    applicationName: "سِير",
    manifest: "/manifest.webmanifest",
    icons: { icon: [{ url: files.favicon, sizes: "32x32", type: "image/png" }, { url: files.icon192, sizes: "192x192", type: "image/png" }], apple: [{ url: files.apple, sizes: "180x180" }] },
    appleWebApp: { capable: true, title: "سِير", statusBarStyle: "default" },
    formatDetection: { telephone: false },
  };
}
export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F5F4FB" }, { media: "(prefers-color-scheme: dark)", color: "#0F0D2A" }],
  viewportFit: "cover",
};
// Applies the saved light/dark choice before first paint so the page never flashes.
const themeScript = `try{var t=localStorage.getItem("seer-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
    <body>{children}<InstallRegistrar /><ErrorWatch /><ConfirmLayer /></body>
  </html>;
}
