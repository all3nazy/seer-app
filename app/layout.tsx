import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "سِير | SEER", description: "منصة تشغيل وإدارة المدارس والحضانات" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ar" dir="rtl"><body>{children}</body></html>; }
