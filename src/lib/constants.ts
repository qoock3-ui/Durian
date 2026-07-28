import type { PrizeTier } from "../../shared/invoice";

export const CURRENCIES = ["TWD", "VND", "USD", "EUR", "JPY", "GBP", "HKD", "SGD", "AUD", "CAD", "KRW"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const REGIONS = ["TW", "VN", "US", "OTHER"] as const;
export type Region = (typeof REGIONS)[number];

export const REGION_LABEL: Record<Region, string> = { TW: "台灣", VN: "越南", US: "美國", OTHER: "其他地區" };
export const REGION_FLAG: Record<Region, string> = { TW: "🇹🇼", VN: "🇻🇳", US: "🇺🇸", OTHER: "🌏" };
/** 地區 badge 底色(粉彩,搭配 ink 描邊) */
export const REGION_COLOR: Record<Region, string> = {
  TW: "bg-p-sky",
  VN: "bg-p-rose",
  US: "bg-p-lilac",
  OTHER: "bg-p-stone",
};
/** 各地區的預設幣別,記帳時自動帶入 */
export const REGION_CURRENCY: Record<Region, Currency> = {
  TW: "TWD",
  VN: "VND",
  US: "USD",
  OTHER: "TWD",
};

// ── 分類 ─────────────────────────────────────────────
// 分類全部存在資料庫,由使用者自行增修,前端不再寫死任何一份清單。
export const CATEGORY_KINDS = ["asset", "income", "expense"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export type Category = {
  id: number;
  kind: CategoryKind;
  key: string;
  group_name: string;
  label: string;
  icon: string;
  tint: string;
  /** 資產專用:-1 代表計入淨資產時為減項(負債、保險) */
  sign: number;
  sort: number;
  archived: number;
};

/** 新增分類時可挑的粉彩底色,與後端 TINTS 對應 */
export const TINTS = [
  "bg-p-peach", "bg-p-sky", "bg-p-lilac", "bg-p-rose",
  "bg-p-mint", "bg-p-butter", "bg-p-sage", "bg-p-stone",
] as const;

/**
 * 每個粉彩底色對應的圖表色(同色系深版)。
 * 介面用粉彩、圖表用深版——八條粉彩線疊在白底上會糊成一片。
 * 使用者自訂的分類挑了哪個底色,圖表就自動拿到對應的深色。
 */
export const TINT_CHART_COLOR: Record<string, string> = {
  "bg-p-peach": "#e8814a",
  "bg-p-sky": "#5a93d4",
  "bg-p-lilac": "#8b72d9",
  "bg-p-rose": "#db6e95",
  "bg-p-mint": "#45a87e",
  "bg-p-butter": "#d0a02e",
  "bg-p-sage": "#7f9e4f",
  "bg-p-stone": "#9a93a3",
};
export const chartColor = (tint: string): string => TINT_CHART_COLOR[tint] ?? "#9a93a3";

// ── 收入頻率 ──────────────────────────────────────────
export type Frequency = "monthly" | "yearly" | "once";
export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "monthly", label: "每月" },
  { value: "yearly", label: "每年" },
  { value: "once", label: "單次" },
];
export const FREQUENCY_LABEL = Object.fromEntries(FREQUENCIES.map((f) => [f.value, f.label])) as Record<Frequency, string>;

// ── 資料列型別 ────────────────────────────────────────
// category / type 存的是 Category.key,值由分類表決定,故為 string。
export type Asset = {
  id: number; name: string; category: string; region: Region;
  amount: number; currency: Currency; note: string | null;
};
export type Income = {
  id: number; name: string; type: string; region: Region;
  amount: number; currency: Currency; frequency: Frequency; note: string | null;
};
export type Expense = {
  id: number; name: string; category: string; region: Region;
  amount: number; currency: Currency; date: string; note: string | null;
};
/**
 * 掃 QR Code 存下來的發票。expense_id 指向自動記下的那筆花費。
 * prize_tier 為 null 代表還沒對獎(該期未開獎,或中獎號碼還沒抓到)。
 */
export type Invoice = {
  id: number;
  inv_num: string;
  inv_date: string;
  period: string;
  random_code: string;
  total_amount: number;
  seller_ban: string;
  seller_name: string | null;
  /** JSON 字串,[{ name, qty, price }] */
  items: string | null;
  expense_id: number | null;
  prize_tier: PrizeTier | null;
  prize_amount: number | null;
  checked_at: string | null;
};

export type Rates = { rates: Record<string, number>; updated_at: string | null };
export type User = { id: number; email: string; name: string; is_admin?: boolean };
