import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useStore } from "../store";
import { Card, CardTitle, MonthNav } from "../components/ui";
import { EXPENSE_CATEGORIES } from "../lib/constants";
import { shiftMonth } from "./Expenses";
import {
  currentMonthKey, expensesInMonth, fmtTWD, lastMonths, monthLabel, sumByCategory,
  totalExpenseTWD, totalMonthlyIncomeTWD,
} from "../lib/finance";

const GRID = "#e7e3ec";
const axisFmt = (v: number) => (v >= 10000 ? `${Math.round(v / 1000) / 10}萬` : String(v));

// 圖表 tooltip 也要遵守「粗描邊、零陰影」
const TOOLTIP = {
  contentStyle: {
    border: "2px solid #2e2733",
    borderRadius: 16,
    background: "#fff",
    boxShadow: "none",
    fontSize: 13,
    fontVariantNumeric: "tabular-nums" as const,
  },
  cursor: { fill: "rgba(46,39,51,0.06)", stroke: "#2e2733", strokeDasharray: "3 3" },
};

export default function Trends() {
  const { incomes, expenses, rates } = useStore();
  const rateMap = rates.rates;
  const [month, setMonth] = useState(currentMonthKey());

  const monthlyIncome = totalMonthlyIncomeTWD(incomes, rateMap);

  const rows12 = useMemo(
    () =>
      lastMonths(12).map((ym) => {
        const spent = totalExpenseTWD(expensesInMonth(expenses, ym), rateMap);
        return { ym, label: monthLabel(ym), 收入: Math.round(monthlyIncome), 支出: Math.round(spent) };
      }),
    [expenses, monthlyIncome, rateMap],
  );

  const rows6 = useMemo(
    () =>
      lastMonths(6).map((ym) => {
        const byCat = sumByCategory(expensesInMonth(expenses, ym), rateMap);
        const row: Record<string, number | string> = { label: monthLabel(ym) };
        for (const c of EXPENSE_CATEGORIES) row[c.label] = Math.round(byCat[c.value] ?? 0);
        return row;
      }),
    [expenses, rateMap],
  );

  // 選定月份的分類占比
  const byCat = useMemo(() => sumByCategory(expensesInMonth(expenses, month), rateMap), [expenses, month, rateMap]);
  const catRows = EXPENSE_CATEGORIES.map((c) => ({
    cat: c.value,
    label: c.label,
    icon: c.icon,
    color: c.color,
    amount: byCat[c.value] ?? 0,
  }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const catTotal = catRows.reduce((s, r) => s + r.amount, 0);

  const [y, m] = month.split("-");

  return (
    <div className="space-y-4">
      <h1 className="font-round text-2xl font-bold">趨勢</h1>

      <Card>
        <CardTitle>月均收入 vs 支出(近 12 個月,TWD)</CardTitle>
        <div className="h-72">
          <ResponsiveContainer>
            <LineChart data={rows12}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis fontSize={12} tickFormatter={axisFmt} />
              <Tooltip formatter={(v) => fmtTWD(Number(v))} {...TOOLTIP} />
              <Legend />
              <Line type="monotone" dataKey="收入" stroke="#4fb58b" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="支出" stroke="#f0803c" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-ink-3">
          收入取自「收入」頁的月均設定值,不是實際入帳流水,所以是一條固定線。
        </p>
      </Card>

      <Card>
        <CardTitle>分類支出趨勢(近 6 個月,TWD)</CardTitle>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={rows6}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis fontSize={12} tickFormatter={axisFmt} />
              <Tooltip formatter={(v) => fmtTWD(Number(v))} {...TOOLTIP} />
              <Legend />
              {EXPENSE_CATEGORIES.map((c) => (
                <Bar key={c.value} dataKey={c.label} stackId="spend" fill={c.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-round text-lg font-bold md:text-base">分類占比</h2>
          <MonthNav
            label={`${y} 年 ${Number(m)} 月`}
            onPrev={() => setMonth(shiftMonth(month, -1))}
            onNext={() => setMonth(shiftMonth(month, 1))}
          />
        </div>
        {catRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-3">本月無花費</p>
        ) : (
          <div className="space-y-2.5">
            {catRows.map((r) => (
              <div key={r.cat} className="flex items-center gap-2 text-sm sm:gap-3">
                <span className="w-20 shrink-0 truncate sm:w-24">
                  {r.icon} {r.label}
                </span>
                <div className="h-4 min-w-8 flex-1 overflow-hidden rounded-full border-2 border-ink bg-card">
                  <div
                    className="h-full"
                    style={{ width: `${(r.amount / catTotal) * 100}%`, backgroundColor: r.color }}
                  />
                </div>
                <span className="tnum w-9 shrink-0 text-right text-xs text-ink-3">
                  {Math.round((r.amount / catTotal) * 100)}%
                </span>
                <span className="tnum w-20 shrink-0 text-right text-xs text-ink-2 sm:w-24 sm:text-sm">
                  {fmtTWD(r.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>月度明細</CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-ink text-left text-ink-2">
                <th className="py-2 font-round">月份</th>
                <th className="py-2 text-right font-round">收入</th>
                <th className="py-2 text-right font-round">支出</th>
                <th className="py-2 text-right font-round">結餘</th>
              </tr>
            </thead>
            <tbody>
              {[...rows12].reverse().map((r) => (
                <tr key={r.ym} className="border-b-2 border-line-soft">
                  <td className="py-2">{r.label}</td>
                  <td className="tnum py-2 text-right text-income">{fmtTWD(r.收入)}</td>
                  <td className="tnum py-2 text-right text-expense">{r.支出 === 0 ? "-" : fmtTWD(r.支出)}</td>
                  <td
                    className={`tnum py-2 text-right font-bold ${
                      r.收入 - r.支出 >= 0 ? "text-ink" : "text-danger"
                    }`}
                  >
                    {fmtTWD(r.收入 - r.支出)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
