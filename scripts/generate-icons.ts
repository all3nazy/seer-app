// Renders the home-screen icons (lib/app-icons.ts) to PNG files in public/icons.
// Run with: npx tsx scripts/generate-icons.ts
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { iconDesigns, iconSvg, iconTones } from "../lib/app-icons";

mkdirSync("public/icons", { recursive: true });
const png = (svg: string, size: number, file: string) => sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(`public/icons/${file}`);
async function main() {
for (const design of iconDesigns) for (const tone of iconTones) {
  const name = `${design}-${tone}`;
  await png(iconSvg(design, tone), 512, `${name}-512.png`);
  await png(iconSvg(design, tone), 192, `${name}-192.png`);
  await png(iconSvg(design, tone, { maskable: true }), 512, `${name}-maskable-512.png`);
  await png(iconSvg(design, tone), 180, `${name}-apple-180.png`);
  await png(iconSvg(design, tone, { rounded: true }), 32, `${name}-32.png`);
}
console.log("icons written");
}
void main();
