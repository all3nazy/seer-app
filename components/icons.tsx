// Outline icons drawn inline so no icon font or external request is needed.
const paths = {
  home: "M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z",
  board: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  sound: "M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12",
  mute: "M4 9h4l5-4v14l-5-4H4zM17 9l5 5M22 9l-5 5",
  logout: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10",
  plus: "M12 5v14M5 12h14",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  arrowNext: "M15 6l-6 6 6 6",
  arrowPrev: "M9 6l6 6-6 6",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  check: "M5 12l5 5 9-10",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-5-6",
  chat: "M4 5h16v11H9l-5 4z",
  wallet: "M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-3v3M17 13h2",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.4z",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0",
  child: "M12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 22v-6l-3-3 3-4h8l3 4-3 3v6",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  list: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z",
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, label }: { name: IconName; label?: string }) {
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false"><path d={paths[name]} /></svg>;
}
export function Logo({ href = "/", label = "سِير — الصفحة الرئيسية" }: { href?: string; label?: string }) {
  return <a className="logo" href={href} aria-label={label}>سِير<span className="logo-dot" aria-hidden="true">.</span></a>;
}

/** The brand's progress mark: a sun that rises with each stage, full and coral when done. */
export function SunPhase({ step, size = 24 }: { step: 0 | 1 | 2 | 3; size?: number }) {
  const fraction = [0, 0.5, 0.78, 1][step];
  const r = 8, cx = 12, cy = 12;
  let fill = null;
  if (fraction >= 1) fill = <circle cx={cx} cy={cy} r={r} className="sun-fill" />;
  else if (fraction > 0) {
    const chord = cy + r - 2 * r * fraction;
    const half = Math.sqrt(r * r - (chord - cy) ** 2);
    fill = <path className="sun-fill" d={`M${cx - half} ${chord}A${r} ${r} 0 ${fraction > 0.5 ? 1 : 0} 0 ${cx + half} ${chord}Z`} />;
  }
  return <svg className={`sun-phase step-${step}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx={cx} cy={cy} r={r} className="sun-ring" />{fill}
  </svg>;
}

/** Isometric stack of task slabs with a setting sun, for the welcome banner. */
export function StackArt({ className }: { className?: string }) {
  const slab = (y: number, top: string, side: string, front: string) => <g transform={`translate(0 ${y})`}>
    <path d="M30 70 130 20 230 70 130 120Z" fill={top} />
    <path d="M30 70v22l100 50V120Z" fill={front} />
    <path d="M230 70v22l-100 50V120Z" fill={side} />
  </g>;
  return <svg className={className} viewBox="0 0 260 210" role="img" aria-label="رسم لمهام مرتبة فوق بعض" focusable="false">
    <ellipse cx="130" cy="186" rx="110" ry="16" fill="currentColor" opacity=".08" />
    {slab(80, "#8C7FC9", "#3A4FA0", "#5C6FC0")}
    {slab(44, "#FFB4A1", "#E06A4E", "#FF7A59")}
    {slab(8, "#E9E3FF", "#7C5CFF", "#A58BFF")}
    <g transform="translate(0 8)" fill="#7C5CFF" opacity=".55"><path d="M80 66l50-25 6 3-50 25z" /><path d="M95 74l50-25 6 3-50 25z" /><path d="M110 82l40-20 6 3-40 20z" /></g>
    <circle cx="214" cy="30" r="20" fill="#FF7A59" />
  </svg>;
}
