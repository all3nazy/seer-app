import { cookies } from "next/headers";
import { iconCookie, iconFiles, parseIconChoice } from "../../lib/app-icons";

export const dynamic = "force-dynamic";

/** The installable app's manifest. Its icons follow the icon the person chose in Settings. */
export async function GET() {
  const { choice, tone } = parseIconChoice((await cookies()).get(iconCookie)?.value);
  const files = iconFiles(choice);
  const manifest = {
    id: "/dashboard",
    name: "سِير — تشغيل المدارس والحضانات",
    short_name: "سِير",
    description: "الحضور والتسليم والمهام والمالية والتواصل مع الأهالي في مكان واحد.",
    lang: "ar",
    dir: "rtl",
    start_url: "/dashboard?source=app",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    background_color: tone === "dark" ? "#0F0D2A" : "#F5F4FB",
    theme_color: tone === "dark" ? "#0F0D2A" : "#3E1657",
    categories: ["education", "productivity", "business"],
    icons: [
      { src: files.icon192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: files.icon512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: files.maskable, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "الحضور", url: "/dashboard/attendance", icons: [{ src: files.icon192, sizes: "192x192" }] },
      { name: "تسليم الطلاب", url: "/dashboard/pickup", icons: [{ src: files.icon192, sizes: "192x192" }] },
      { name: "مهامي", url: "/dashboard/my", icons: [{ src: files.icon192, sizes: "192x192" }] },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "private, no-cache" } });
}
