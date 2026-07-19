import { useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useStore } from "../store";
import { Card, CardTitle } from "../components/ui";
import { EXPENSE_CATEGORIES } from "../lib/constants";
import {
  expensesInMonth, fmtTWD, lastMonths, monthLabel, sumByCategory, totalExpenseTWD, totalMonthlyIncomeTWD,
} from "../lib/finance";

export default function Trends() {
  const { incomes, expenses, rates } = useStore();
  const rateMap = rates.rates;

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

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">趨勢</h1>

      <Card>
        <CardTitle>月均收入 vs 支出趨勢(近 12 個月,TWD)</CardTitle>
        <div className="h-72">
          <ResponsiveContainer>
            <LineChart data={rows12}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis fontSize={12} tickFormatter={(v: number) => (v >= 10000 ? `${v / 10000}萬` : String(v))} />
              <Tooltip formatter={(v) => fmtTWD(Number(v))} />
              <Legend />
              <Line type="monotone" dataKey="收入" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="支出" stroke="#f97316" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardTitle>分類支出趨勢(近 6 個月,TWD)</CardTitle>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={rows6}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis fontSize={12} tickFormatter={(v: number) => (v >= 10000 ? `${v / 10000}萬` : String(v))} />
              <Tooltip formatter={(v) => fmtTWD(Number(v))} />
              <Legend />
              {EXPENSE_CATEGORIES.map((c) => (
                <Bar key={c.value} dataKey={c.label} stackId="spend" fill={c.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardTitle>月度明細</CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2">月份</th>
                <th className="py-2 text-right">收入</th>
                <th className="py-2 text-right">支出</th>
                <th className="py-2 text-right">結餘</th>
              </tr>
            </thead>
            <tbody>
              {[...rows12].reverse().map((r) => (
                <tr key={r.ym} className="border-b border-slate-100">
                  <td className="py-2">{r.label}</td>
                  <td className="py-2 text-right text-emerald-600">{fmtTWD(r.收入)}</td>
                  <td className="py-2 text-right text-orange-600">{r.支出 === 0 ? "-" : fmtTWD(r.支出)}</td>
                  <td className={`py-2 text-right font-medium ${r.收入 - r.支出 >= 0 ? "text-slate-700" : "text-red-600"}`}>
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
