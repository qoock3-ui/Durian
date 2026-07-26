/**
 * 阿榴 — FinTrack 吉祥物(專案代號 Durian)
 * Daak 風格的粗線條線畫:抹茶綠身體、墨黑描邊、腮紅。
 */
export default function Mascot({
  size = 64,
  mood = "happy",
  className = "",
}: {
  size?: number;
  /** happy 微笑 · sleepy 還沒記帳 · cheer 記帳完成 */
  mood?: "happy" | "sleepy" | "cheer";
  className?: string;
}) {
  // 12 根刺:以中心 (50,50) 為圓心,刺尖 r=42、凹谷 r=30 交錯
  const spikes =
    "50,8 57.8,21 71,13.6 71.2,28.8 86.4,29 79,42.2 92,50 79,57.8 " +
    "86.4,71 71.2,71.2 71,86.4 57.8,79 50,92 42.2,79 29,86.4 28.8,71.2 " +
    "13.6,71 21,57.8 8,50 21,42.2 13.6,29 28.8,28.8 29,13.6 42.2,21";

  const mouth =
    mood === "cheer"
      ? "M40,56 Q50,68 60,56 Z" // 張嘴笑
      : mood === "sleepy"
        ? "M43,61 Q50,57 57,61" // 抿嘴
        : "M41,58 Q50,66 59,58"; // 微笑

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="阿榴"
    >
      <polygon
        points={spikes}
        fill="var(--color-p-sage)"
        stroke="var(--color-ink)"
        strokeWidth="4.5"
        strokeLinejoin="round"
      />
      {mood === "sleepy" ? (
        <>
          <path d="M36,47 Q41,43 46,47" fill="none" stroke="var(--color-ink)" strokeWidth="3.6" strokeLinecap="round" />
          <path d="M54,47 Q59,43 64,47" fill="none" stroke="var(--color-ink)" strokeWidth="3.6" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="41" cy="47" r="3.4" fill="var(--color-ink)" />
          <circle cx="59" cy="47" r="3.4" fill="var(--color-ink)" />
        </>
      )}
      <path
        d={mouth}
        fill={mood === "cheer" ? "var(--color-ink)" : "none"}
        stroke="var(--color-ink)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="57" r="4" fill="var(--color-p-rose)" opacity="0.85" />
      <circle cx="68" cy="57" r="4" fill="var(--color-p-rose)" opacity="0.85" />
    </svg>
  );
}
