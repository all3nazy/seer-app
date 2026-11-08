/**
 * Each organization type gets its own look: a soft watermark pattern behind the app and a bot
 * character for the assistant. Patterns are single-colour SVG used as a CSS mask, so the colour
 * follows the light/dark theme.
 */
export type Stage = "nursery" | "kindergarten" | "school";
export function stageOf(type: string | null | undefined): Stage {
  return type === "nursery" || type === "kindergarten" ? type : "school";
}

export type BotPersona = { name: string; title: string; greeting: string; hint: string };
export const botPersonas: Record<Stage, BotPersona> = {
  nursery: { name: "قمرة", title: "مساعدة الحضانة", greeting: "هلا! أنا قمرة، أساعدك تتابعين الصغار ويومهم.", hint: "اسألني: «كم طفل حاضر اليوم؟» أو «سلّم ريم»" },
  kindergarten: { name: "أرنوب", title: "مساعد الروضة", greeting: "أهلين! أنا أرنوب، خلّنا نرتّب يوم الروضة سوا.", hint: "اسألني: «مين غايب اليوم؟» أو «افتح الحضور»" },
  school: { name: "نجيب", title: "مساعد المدرسة", greeting: "مرحبًا! أنا نجيب، مساعدك في تشغيل المدرسة.", hint: "اسألني: «كم مهمة متأخرة؟» أو «ابحث عن طالب»" },
};

const tile = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const at = (x: number, y: number, rotate: number, scale: number, shape: string) => `<g transform="translate(${x} ${y}) rotate(${rotate}) scale(${scale})">${shape}</g>`;

// Shapes are drawn on a 40×40 box centred on 0,0.
const shapes = {
  bottle: `<path d="M-6-18h12M-4-18v-4h8v4M-9-14h18v6l-3 3v24a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3V-5l-3-3z"/><path d="M-6 0h12M-6 6h12M-6 12h12"/>`,
  star: `<path d="M0-16l4.7 9.5 10.5 1.5-7.6 7.4 1.8 10.4L0 7.9l-9.4 4.9 1.8-10.4-7.6-7.4L-4.7-6.5z"/>`,
  moon: `<path d="M8-14A15 15 0 1 0 14 8 12 12 0 0 1 8-14z"/>`,
  cloud: `<path d="M-14 8h26a8 8 0 0 0 0-16 11 11 0 0 0-21-2 7 7 0 0 0-5 18z"/>`,
  heart: `<path d="M0 12S-14 3-14-5a7 7 0 0 1 14-2 7 7 0 0 1 14 2c0 8-14 17-14 17z"/>`,
  rabbit: `<path d="M-6-4c-3-8-3-16 0-18 3 1 4 9 3 17M6-4c3-8 3-16 0-18-3 1-4 9-3 17"/><circle cx="0" cy="6" r="11"/><path d="M-4 4h.01M4 4h.01M-2 10q2 2 4 0"/>`,
  bird: `<path d="M-14 4c4-10 16-12 22-4l6-2-3 5c0 8-9 13-19 9l-6 4 2-6"/><path d="M2-3h.01M-6 6q6 2 10-3"/>`,
  ball: `<circle r="14"/><path d="M-14 0h28M0-14c-6 8-6 20 0 28M0-14c6 8 6 20 0 28"/>`,
  blocks: `<rect x="-15" y="-2" width="14" height="14" rx="2"/><rect x="1" y="-2" width="14" height="14" rx="2"/><rect x="-7" y="-16" width="14" height="14" rx="2"/>`,
  kite: `<path d="M0-16L11 0 0 16-11 0z"/><path d="M0 16q-3 6 2 8q-4 3 0 6"/>`,
  book: `<path d="M-15-10q8-4 15 0v22q-7-4-15 0zM15-10q-8-4-15 0v22q7-4 15 0z"/>`,
  pencil: `<path d="M-14 14l4-12L8-16l8 8-18 18zM-10 2l8 8M4-12l8 8"/>`,
  sun: `<circle r="7"/><path d="M0-16v4M0 12v4M-16 0h4M12 0h4M-11-11l3 3M8 8l3 3M-11 11l3-3M8-8l3-3"/>`,
  ruler: `<rect x="-16" y="-6" width="32" height="12" rx="2" transform="rotate(-20)"/><path d="M-9-4l1 4M-3-6l1 4M3-8l1 4M9-10l1 4" transform="rotate(-20) translate(0 4)"/>`,
  abc: `<path d="M-12 8l5-16 5 16M-10 3h6M4-8h5a4 4 0 0 1 0 8H4zM4 0h6a4 4 0 0 1 0 8H4z"/>`,
};

export const stagePatterns: Record<Stage, string> = {
  nursery: tile([
    at(36, 40, -12, 1, shapes.bottle), at(120, 30, 0, 0.8, shapes.star), at(185, 70, 10, 1, shapes.moon),
    at(70, 120, 0, 1, shapes.cloud), at(160, 150, -8, 0.9, shapes.heart), at(30, 185, 15, 0.7, shapes.star),
    at(110, 195, 8, 0.9, shapes.bottle),
  ].join("")),
  kindergarten: tile([
    at(40, 42, -6, 1, shapes.rabbit), at(130, 34, 0, 0.9, shapes.bird), at(190, 100, 12, 0.85, shapes.ball),
    at(80, 125, 0, 1, shapes.blocks), at(165, 175, -10, 0.9, shapes.kite), at(30, 180, 10, 0.8, shapes.star),
  ].join("")),
  school: tile([
    at(42, 40, -8, 1, shapes.book), at(130, 36, 30, 0.9, shapes.pencil), at(188, 104, 0, 0.95, shapes.sun),
    at(76, 122, 0, 1, shapes.ruler), at(160, 178, -6, 0.9, shapes.abc), at(32, 184, 0, 0.8, shapes.star),
  ].join("")),
};
export function patternUrl(stage: Stage): string {
  return `url("data:image/svg+xml,${encodeURIComponent(stagePatterns[stage])}")`;
}
