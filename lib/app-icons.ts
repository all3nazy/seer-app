/**
 * The app's home-screen icons: three original designs, each in a light and a dark tone. The person
 * picks one in Settings; the choice is kept in a cookie so the manifest and the Apple touch icon
 * follow it. Shapes are drawn on a 512×512 canvas.
 */
export const iconDesigns = ["letter", "path", "growth"] as const;
export type IconDesign = (typeof iconDesigns)[number];
export const iconTones = ["light", "dark"] as const;
export type IconTone = (typeof iconTones)[number];
export type IconChoice = `${IconDesign}-${IconTone}`;
export const defaultIcon: IconChoice = "path-light";
export const iconCookie = "seer-icon";

export const iconDesignLabels: Record<IconDesign, { name: string; idea: string }> = {
  letter: { name: "حرف السين", idea: "حرف «س» من اسم سِير بنقطته البرتقالية؛ هوية مباشرة وواضحة." },
  path: { name: "المسار", idea: "طريق متعرّج ينتهي بنجمة: «سِير» رحلة الطالب من أول يوم إلى التخرّج." },
  growth: { name: "النبتة والكتاب", idea: "كتاب مفتوح تنبت منه ورقتان: التعلّم والنمو والرعاية." },
};
export const iconToneLabels: Record<IconTone, string> = { light: "فاتح", dark: "مظلم" };

const palette: Record<IconTone, { bg: string; bg2: string; ink: string; accent: string }> = {
  light: { bg: "#FFFFFF", bg2: "#EFE9FF", ink: "#3E1657", accent: "#FF7A59" },
  dark: { bg: "#1B1446", bg2: "#0F0D2A", ink: "#D9CCFF", accent: "#FF8A6B" },
};

const marks: Record<IconDesign, (c: (typeof palette)[IconTone]) => string> = {
  // «س»: three teeth read right-to-left, then the open bowl; the dot sits above like the logo.
  letter: c => `<g transform="translate(26 6)"><path d="M376 196v58a38 38 0 0 1-76 0v-26m0 26a38 38 0 0 1-76 0v-26m0 26v24c0 62-44 104-98 104-40 0-66-22-78-52" fill="none" stroke="${c.ink}" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="300" cy="128" r="30" fill="${c.accent}"/></g>`,
  // A winding road that climbs to a star.
  path: c => `<path d="M150 420C150 330 362 340 362 256S168 182 214 130" fill="none" stroke="${c.ink}" stroke-width="46" stroke-linecap="round"/>
<path d="M150 420C150 330 362 340 362 256S168 182 214 130" fill="none" stroke="${c.bg}" stroke-width="7" stroke-linecap="round" stroke-dasharray="18 22" opacity=".85"/>
<path d="M300 66l13 27 30 4-22 21 5 30-26-14-27 14 5-30-22-21 30-4z" fill="${c.accent}"/>`,
  // An open book with a sprout of two leaves.
  growth: c => `<path d="M96 330c56-26 112-26 160 8 48-34 104-34 160-8v76c-56-26-112-26-160 8-48-34-104-34-160-8z" fill="none" stroke="${c.ink}" stroke-width="30" stroke-linejoin="round"/>
<path d="M256 338V214" stroke="${c.ink}" stroke-width="28" stroke-linecap="round"/>
<path d="M256 240c-8-58-48-92-108-94 0 62 40 98 108 94z" fill="${c.ink}"/>
<path d="M256 214c8-60 52-96 116-98 0 66-44 102-116 98z" fill="${c.accent}"/>`,
};

/** The icon as an SVG document. `maskable` keeps the mark inside the platforms' safe circle. */
export function iconSvg(design: IconDesign, tone: IconTone, { maskable = false, rounded = false } = {}): string {
  const c = palette[tone];
  const scale = maskable ? 0.72 : 0.9;
  const offset = (512 - 512 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.bg}"/><stop offset="1" stop-color="${c.bg2}"/></linearGradient></defs>
<rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#g)"/>
<g transform="translate(${offset} ${offset}) scale(${scale})">${marks[design](c)}</g>
</svg>`;
}

export function isIconChoice(value: unknown): value is IconChoice {
  if (typeof value !== "string") return false;
  const [design, tone] = value.split("-");
  return (iconDesigns as readonly string[]).includes(design) && (iconTones as readonly string[]).includes(tone);
}
export function parseIconChoice(value: unknown): { design: IconDesign; tone: IconTone; choice: IconChoice } {
  const choice = isIconChoice(value) ? value : defaultIcon;
  const [design, tone] = choice.split("-") as [IconDesign, IconTone];
  return { design, tone, choice };
}
/** Files generated from the SVGs by scripts/generate-icons.mjs. */
export function iconFiles(choice: IconChoice) {
  return {
    icon192: `/icons/${choice}-192.png`,
    icon512: `/icons/${choice}-512.png`,
    maskable: `/icons/${choice}-maskable-512.png`,
    apple: `/icons/${choice}-apple-180.png`,
    favicon: `/icons/${choice}-32.png`,
  };
}
