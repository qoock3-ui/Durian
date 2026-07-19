import type { Asset, Currency, Expense, Income } from "./constants";
import { NEGATIVE_CATEGORIES } from "./constants";

export type RateMap = Record<string, number>;

export function toTWD(amount: number, currency: Currency, rates: RateMap): number {
  return amount * (rates[currency] ?? 1);
}

export function fmt(amount: number, currency?: string): string {
  const rounded = Math.round(amount);
  return `${currency ? currency + " " : ""}${rounded.toLocaleString("zh-TW")}`;
}

export function fmtTWD(amount: number): string {
  return `NT$ ${Math.round(amount).toLocaleString("zh-TW")}`;
}

/** 月均收入:每月→全額、每年→÷12、單次→不計 */
export function monthlyAmount(income: Income): number {
  if (income.frequency === "monthly") return income.amount;
  if (income.frequency === "yearly") return income.amount / 12;
  return 0;
}

export function totalMonthlyIncomeTWD(incomes: Income[], rates: RateMap): number {
  return incomes.reduce((sum, i) => sum + toTWD(monthlyAmount(i), i.currency, rates), 0);
}

/** 淨資產:(現金+投資+不動產+勞退+其他) − (負債+保險),TWD */
export function netWorthTWD(assets: Asset[], rates: RateMap): number {
  return assets.reduce((sum, a) => {
    const twd = toTWD(a.amount, a.currency, rates);
    return sum + (NEGATIVE_CATEGORIES.includes(a.category) ? -twd : twd);
  }, 0);
}

export function monthKey(date: string): string {
  return date.slice(0, 7); // YYYY-MM
}

export function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export function expensesInMonth(expenses: Expense[], ym: string): Expense[] {
  return expenses.filter((e) => monthKey(e.date) === ym);
}

export function totalExpenseTWD(expenses: Expense[], rates: RateMap): number {
  return expenses.reduce((sum, e) => sum + toTWD(e.amount, e.currency, rates), 0);
}

/** 近 n 個月的 YYYY-MM 序列(含當月,由舊到新) */
export function lastMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}/${Number(m)}月`;
}

/** 依分類彙總某清單支出(TWD) */
export function sumByCategory(expenses: Expense[], rates: RateMap): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of expenses) {
    out[e.category] = (out[e.category] ?? 0) + toTWD(e.amount, e.currency, rates);
  }
  return out;
}

/** 依幣別彙總(原幣別金額),用於「TWD/VND 月均」這類卡片 */
export function sumByCurrency(items: { amount: number; currency: Currency }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[i.currency] = (out[i.currency] ?? 0) + i.amount;
  return out;
}
