export const CURRENCIES = ["TWD", "VND", "USD", "EUR", "JPY", "GBP", "HKD", "SGD", "AUD", "CAD", "KRW"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const REGIONS = ["TW", "VN", "US", "OTHER"] as const;
export type Region = (typeof REGIONS)[number];

export const REGION_LABEL: Record<Region, string> = { TW: "台灣", VN: "越南", US: "美國", OTHER: "其他地區" };
export const REGION_FLAG: Record<Region, string> = { TW: "🇹🇼", VN: "🇻🇳", US: "🇺🇸", OTHER: "🌏" };
export const REGION_COLOR: Record<Region, string> = {
  TW: "bg-blue-100 text-blue-700",
  VN: "bg-red-100 text-red-700",
  US: "bg-indigo-100 text-indigo-700",
  OTHER: "bg-slate-100 text-slate-600",
};

// ── 資產分類(含分組,對應規格書下拉選單結構)──────────────────
export type AssetCategory =
  | "cash_tw" | "cash_vn" | "cash_other"
  | "stock_tw" | "etf_fund" | "stock_vn" | "stock_us"
  | "realestate_tw" | "realestate_vn"
  | "insurance" | "pension" | "liability" | "other";

export const ASSET_GROUPS: { group: string; icon: string; items: { value: AssetCategory; label: string }[] }[] = [
  {
    group: "現金與存款", icon: "💰",
    items: [
      { value: "cash_tw", label: "現金/存款(台灣)" },
      { value: "cash_vn", label: "現金/存款(越南)" },
      { value: "cash_other", label: "現金/存款(其他)" },
    ],
  },
  {
    group: "投資", icon: "📈",
    items: [
      { value: "stock_tw", label: "台股" },
      { value: "etf_fund", label: "ETF/基金" },
      { value: "stock_vn", label: "越南股票" },
      { value: "stock_us", label: "美股" },
    ],
  },
  {
    group: "不動產", icon: "🏠",
    items: [
      { value: "realestate_tw", label: "台灣房產" },
      { value: "realestate_vn", label: "越南房產" },
    ],
  },
  { group: "保障", icon: "🛡️", items: [{ value: "insurance", label: "保險" }] },
  { group: "勞退/退休金", icon: "🏦", items: [{ value: "pension", label: "勞退/退休金" }] },
  { group: "負債", icon: "💳", items: [{ value: "liability", label: "負債" }] },
  { group: "其他", icon: "📦", items: [{ value: "other", label: "其他" }] },
];

export const ASSET_CATEGORY_LABEL: Record<AssetCategory, string> = Object.fromEntries(
  ASSET_GROUPS.flatMap((g) => g.items.map((i) => [i.value, i.label])),
) as Record<AssetCategory, string>;

// 淨資產公式:(現金+投資+不動產+勞退) − (負債+保險)
export const POSITIVE_CATEGORIES: AssetCategory[] = [
  "cash_tw", "cash_vn", "cash_other", "stock_tw", "etf_fund", "stock_vn", "stock_us",
  "realestate_tw", "realestate_vn", "pension", "other",
];
export const NEGATIVE_CATEGORIES: AssetCategory[] = ["liability", "insurance"];

// ── 收入 ─────────────────────────────────────────────
export type IncomeType = "active" | "passive" | "investment" | "other";
export const INCOME_TYPES: { value: IncomeType; label: string; icon: string }[] = [
  { value: "active", label: "主動收入(薪資)", icon: "💼" },
  { value: "passive", label: "被動收入", icon: "🌱" },
  { value: "investment", label: "投資收益", icon: "📊" },
  { value: "other", label: "其他收入", icon: "✨" },
];
export const INCOME_TYPE_LABEL = Object.fromEntries(INCOME_TYPES.map((t) => [t.value, t.label])) as Record<IncomeType, string>;

export type Frequency = "monthly" | "yearly" | "once";
export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "monthly", label: "每月" },
  { value: "yearly", label: "每年" },
  { value: "once", label: "單次" },
];
export const FREQUENCY_LABEL = Object.fromEntries(FREQUENCIES.map((f) => [f.value, f.label])) as Record<Frequency, string>;

// ── 支出 ─────────────────────────────────────────────
export type ExpenseCategory = "food" | "transport" | "housing" | "entertainment" | "medical" | "shopping" | "work" | "other";
export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string; icon: string; color: string }[] = [
  { value: "food", label: "餐飲", icon: "🍜", color: "#f59e0b" },
  { value: "transport", label: "交通", icon: "🚗", color: "#3b82f6" },
  { value: "housing", label: "住房水電", icon: "🏠", color: "#8b5cf6" },
  { value: "entertainment", label: "娛樂", icon: "🎮", color: "#ec4899" },
  { value: "medical", label: "醫療健康", icon: "🏥", color: "#10b981" },
  { value: "shopping", label: "購物", icon: "🛍️", color: "#f97316" },
  { value: "work", label: "工作相關", icon: "💼", color: "#64748b" },
  { value: "other", label: "其他", icon: "📦", color: "#94a3b8" },
];
export const EXPENSE_CATEGORY_LABEL = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.label])) as Record<ExpenseCategory, string>;
export const EXPENSE_CATEGORY_COLOR = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.color])) as Record<ExpenseCategory, string>;

// ── 資料列型別 ────────────────────────────────────────
export type Asset = {
  id: number; name: string; category: AssetCategory; region: Region;
  amount: number; currency: Currency; note: string | null;
};
export type Income = {
  id: number; name: string; type: IncomeType; region: Region;
  amount: number; currency: Currency; frequency: Frequency; note: string | null;
};
export type Expense = {
  id: number; name: string; category: ExpenseCategory; region: Region;
  amount: number; currency: Currency; date: string; note: string | null;
};
export type Rates = { rates: Record<string, number>; updated_at: string | null };
export type User = { id: number; email: string; name: string };
