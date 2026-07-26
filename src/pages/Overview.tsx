import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store";
import { Card, EmptyState } from "../components/ui";
import Mascot from "../components/Mascot";
import { ExpenseList, shiftMonth } from "./Expenses";
import {
  currentMonthKey, expensesInMonth, fmtTWD, netWorthTWD, totalExpenseTWD, totalMonthlyIncomeTWD,
} from "../lib/finance";

function greeting(h: number): string {
  if (h < 5) return "夜深了";
  if (h < 11) return "早安";
  if (h < 14) return "午安";
  if (h < 18) return "下午好";
  return "晚安";
}

export default function Overview() {
  const { user, assets, incomes, expenses, rates, cats } = useStore();
  const rateMap = rates.rates;

  const thisMonth = currentMonthKey();
  const lastMonth = shiftMonth(thisMonth, -1);
  const today = new Date().toISOString().slice(0, 10);

  const netWorth = netWorthTWD(assets, rateMap, cats.sign);
  const monthlyIncome = totalMonthlyIncomeTWD(incomes, rateMap);
  const thisMonthTotal = totalExpenseTWD(expensesInMonth(expenses, thisMonth), rateMap);
  const lastMonthTotal = totalExpenseTWD(expensesInMonth(expenses, lastMonth), rateMap);
  const balance = monthlyIncome - thisMonthTotal;

  // 環比:上月為 0 時不顯示,避免出現無意義的百分比
  const momPct =
    lastMonthTotal > 0 ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100) : null;

  const todayCount = expenses.filter((e) => e.date === today).length;

  const recent = useMemo(
    () => [...expenses].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1)).slice(0, 6),
    [expenses],
  );

  return (
    <div className="space-y-4">
      {/* 1 · 問候 */}
      <div className="flex items-center gap-3">
        <Mascot size={44} mood={todayCount > 0 ? "happy" : "sleepy"} />
        <div>
          <h1 className="font-round text-xl font-bold">
            {greeting(new Date().getHours())}，{user?.name}
          </h1>
          <p className="text-xs text-ink-3">
            {todayCount > 0 ? `今天記了 ${todayCount} 筆` : "今天還沒記帳喔"}
            {rates.updated_at && ` · 匯率 ${rates.updated_at.slice(11, 16)} 更新`}
          </p>
        </div>
      </div>

      {/* 2 · 淨資產 */}
      <Card tint="bg-p-lilac">
        <p className="text-sm text-ink-2">總淨資產(TWD)</p>
        <p className="tnum mt-1 font-round text-4xl font-bold">{fmtTWD(netWorth)}</p>
        <p className="mt-2 text-xs text-ink-2">=(現金 + 投資 + 不動產 + 勞退)−(負債 + 保險)</p>
      </Card>

      {/* 3 · 本月收支 */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/incomes" className="block">
          <Card tint="bg-p-mint" className="h-full transition hover:-translate-y-0.5">
            <p className="text-xs text-ink-2 sm:text-sm">月均收入</p>
            <p className="tnum mt-1 font-round text-lg font-bold sm:text-2xl">{fmtTWD(monthlyIncome)}</p>
            <p className="tnum mt-1 text-xs text-ink-2">年約 {fmtTWD(monthlyIncome * 12)}</p>
          </Card>
        </Link>
        <Link to="/expenses" className="block">
          <Card tint="bg-p-peach" className="h-full transition hover:-translate-y-0.5">
            <p className="text-xs text-ink-2 sm:text-sm">本月支出</p>
            <p className="tnum mt-1 font-round text-lg font-bold sm:text-2xl">{fmtTWD(thisMonthTotal)}</p>
            <p className="tnum mt-1 text-xs text-ink-2">
              {momPct === null ? "上月無記錄" : `較上月 ${momPct >= 0 ? "+" : ""}${momPct}%`}
            </p>
          </Card>
        </Link>
      </div>

      <Card tint={balance >= 0 ? "bg-card" : "bg-p-rose"}>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-ink-2">本月結餘(月均收入 − 本月支出)</span>
          <span className={`tnum font-round text-xl font-bold ${balance >= 0 ? "text-income" : "text-danger"}`}>
            {fmtTWD(balance)}
          </span>
        </div>
      </Card>

      {/* 4 · 最近交易 */}
      <Card>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-round text-base font-bold">最近交易</h2>
          <Link to="/expenses" className="text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline">
            看全部 ›
          </Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState text="還沒有任何記錄 — 按右下角的 ＋ 記第一筆" />
        ) : (
          <ExpenseList items={recent} rates={rateMap} />
        )}
      </Card>
    </div>
  );
}
