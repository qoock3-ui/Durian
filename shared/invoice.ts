// 統一發票的期別換算與獎項名稱。純函式,沒有任何平台相依,前後端共用一份
// ——後端拿來對獎與寄信,前端拿來顯示,兩邊不會各算各的。

/** 開立日期所屬的期別。統一發票雙月一期,一律以單數月當 key */
export function periodOf(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  const odd = m - ((m - 1) % 2);
  return `${y}-${String(odd).padStart(2, "0")}`;
}

/** 把 period 往後推 n 個月,回傳 [西元年, 月] */
function shift(period: string, months: number): [number, number] {
  const [y, m] = period.split("-").map(Number);
  const total = m - 1 + months;
  return [y + Math.floor(total / 12), (total % 12) + 1];
}

/** 該期的開獎日:期別起始月 +2 個月的 25 日 */
export function drawDate(period: string): string {
  const [y, m] = shift(period, 2);
  return `${y}-${String(m).padStart(2, "0")}-25`;
}

/** 領獎期間結束日:期別起始月 +6 個月的 5 日 */
export function claimDeadline(period: string): string {
  const [y, m] = shift(period, 6);
  return `${y}-${String(m).padStart(2, "0")}-05`;
}

/** 115 年 7-8 月 */
export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${y - 1911} 年 ${m}-${m + 1} 月`;
}

export type PrizeTier =
  | "none" | "sixth_extra" | "sixth" | "fifth" | "fourth"
  | "third" | "second" | "first" | "grand" | "special";

export const PRIZE_LABEL: Record<PrizeTier, string> = {
  none: "沒中獎",
  sixth_extra: "增開六獎",
  sixth: "六獎",
  fifth: "五獎",
  fourth: "四獎",
  third: "三獎",
  second: "二獎",
  first: "頭獎",
  grand: "特獎",
  special: "特別獎",
};
