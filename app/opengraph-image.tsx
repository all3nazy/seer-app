import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "سِير — يوم المدرسة كله… من جوالك";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The link preview (WhatsApp, X…): the «غسق» purple gradient, the name and the promise. The image
 * renderer joins Arabic letters but lays words out left to right, so each line is a row of words in
 * right-to-left order. The fonts are Alexandria Bold (Arabic and Latin) kept in assets/og.
 */
const line = (text: string, style: React.CSSProperties) => <div style={{ display: "flex", flexDirection: "row-reverse", gap: Number(style.fontSize ?? 40) * 0.1, ...style }}>
  {text.split(" ").map((word, index) => <span key={index}>{word}</span>)}
</div>;

export default async function OpenGraphImage() {
  const [arabic, latin] = await Promise.all([
    readFile(join(process.cwd(), "assets/og/alexandria-arabic-700.ttf")),
    readFile(join(process.cwd(), "assets/og/alexandria-latin-700.ttf")),
  ]);
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "flex-end", padding: "64px 72px",
      background: "linear-gradient(135deg, #3E1657 0%, #5B2A9B 55%, #7C5CFF 100%)", color: "#fff", fontFamily: "Alexandria", position: "relative" }}>
      <div style={{ position: "absolute", top: -140, left: -120, width: 460, height: 460, borderRadius: 460, background: "rgba(255,122,89,0.28)", display: "flex" }} />
      <div style={{ position: "absolute", bottom: -160, left: 260, width: 360, height: 360, borderRadius: 360, background: "rgba(255,255,255,0.06)", display: "flex" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ display: "flex", width: 22, height: 22, borderRadius: 22, background: "#FF7A59" }} />
        <div style={{ display: "flex", fontSize: 84, lineHeight: 1 }}>سير</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 14 }}>
        {line("يوم المدرسة كله", { fontSize: 76, lineHeight: 1.15 })}
        {line("من جوالك", { fontSize: 76, lineHeight: 1.15, color: "#FFD9CE" })}
        {line("منصة سعودية للمدارس والحضانات", { fontSize: 34, marginTop: 14, color: "rgba(255,255,255,0.88)" })}
      </div>
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", fontSize: 26, color: "rgba(255,255,255,0.8)", fontFamily: "AlexandriaLatin" }}>seersa.vercel.app</div>
        <div style={{ display: "flex", padding: "12px 26px", borderRadius: 999, background: "#FF7A59" }}>{line("تجربة مجانية · بدعوة", { fontSize: 28 })}</div>
      </div>
    </div>,
    { ...size, fonts: [{ name: "Alexandria", data: arabic, weight: 700, style: "normal" }, { name: "AlexandriaLatin", data: latin, weight: 700, style: "normal" }] },
  );
}
