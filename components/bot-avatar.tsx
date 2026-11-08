import type { Stage } from "../lib/stage";

/** The assistant's face for each stage, drawn inline so it themes and scales cleanly. */
export function BotAvatar({ stage, size = 48, mood = "idle" }: { stage: Stage; size?: number; mood?: "idle" | "thinking" | "happy" }) {
  const blink = mood === "thinking" ? " bot-thinking" : mood === "happy" ? " bot-happy" : "";
  return <svg className={`bot-avatar${blink}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    {stage === "nursery" ? <>
      <circle cx="32" cy="34" r="24" fill="#FFE7A8" />
      <path d="M44 14a20 20 0 1 0 8 26 16 16 0 0 1-8-26z" fill="#FFD36E" />
      <circle className="bot-eye" cx="24" cy="32" r="3" fill="#3A2E5C" /><circle className="bot-eye" cx="38" cy="32" r="3" fill="#3A2E5C" />
      <path d="M26 41q5 4 10 0" stroke="#3A2E5C" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="19" cy="39" r="3" fill="#FFB4A1" opacity=".8" /><circle cx="43" cy="39" r="3" fill="#FFB4A1" opacity=".8" />
      <path d="M50 10l1.5 3 3.5.5-2.5 2.4.6 3.4-3.1-1.6-3.1 1.6.6-3.4-2.5-2.4 3.5-.5z" fill="#7C5CFF" />
    </> : stage === "kindergarten" ? <>
      <ellipse cx="24" cy="14" rx="5" ry="13" fill="#F3EEFF" stroke="#C9B8FF" strokeWidth="2" /><ellipse cx="40" cy="14" rx="5" ry="13" fill="#F3EEFF" stroke="#C9B8FF" strokeWidth="2" />
      <ellipse cx="24" cy="15" rx="2" ry="8" fill="#FFB4A1" /><ellipse cx="40" cy="15" rx="2" ry="8" fill="#FFB4A1" />
      <circle cx="32" cy="38" r="20" fill="#F3EEFF" stroke="#C9B8FF" strokeWidth="2" />
      <circle className="bot-eye" cx="25" cy="36" r="3" fill="#3A2E5C" /><circle className="bot-eye" cx="39" cy="36" r="3" fill="#3A2E5C" />
      <path d="M30 42h4l-2 2z" fill="#FF7A59" /><path d="M28 46q4 3 8 0" stroke="#3A2E5C" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="19" cy="43" r="3" fill="#FFB4A1" opacity=".8" /><circle cx="45" cy="43" r="3" fill="#FFB4A1" opacity=".8" />
    </> : <>
      <path d="M14 22l6-12 8 8h8l8-8 6 12" fill="#8C7FC9" />
      <ellipse cx="32" cy="36" rx="22" ry="22" fill="#A58BFF" />
      <ellipse cx="32" cy="44" rx="13" ry="12" fill="#E9E3FF" />
      <circle cx="23" cy="31" r="8" fill="#fff" stroke="#3A2E5C" strokeWidth="2.5" /><circle cx="41" cy="31" r="8" fill="#fff" stroke="#3A2E5C" strokeWidth="2.5" />
      <path d="M31 31h2" stroke="#3A2E5C" strokeWidth="2.5" />
      <circle className="bot-eye" cx="23" cy="31" r="3" fill="#3A2E5C" /><circle className="bot-eye" cx="41" cy="31" r="3" fill="#3A2E5C" />
      <path d="M29 39l3 4 3-4z" fill="#FF7A59" />
      <rect x="20" y="50" width="24" height="9" rx="2" fill="#FF7A59" /><path d="M32 50v9" stroke="#fff" strokeWidth="2" />
    </>}
  </svg>;
}
