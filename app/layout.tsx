import type { Metadata, Viewport } from "next";
import "@fontsource-variable/alexandria/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "سِير", template: "%s | سِير" },
  description: "منصة عربية لإدارة عمليات المدارس الأهلية والحضانات: المهام والسجلات والمساعد في مكان واحد.",
};
export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F5F4FB" }, { media: "(prefers-color-scheme: dark)", color: "#0F0D2A" }],
};
// Applies the saved light/dark choice before first paint so the page never flashes.
const themeScript = `try{var t=localStorage.getItem("seer-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
    <body>{children}</body>
  </html>;
}
