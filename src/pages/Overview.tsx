import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { del, post, put } from "../api";
import { useStore } from "../store";
import { Card, CardTitle, EmptyState, PrimaryButton, RegionTabs } from "../components/ui";
import FormModal from "../components/FormModal";
import { EXPENSE_FIELDS } from "../components/entityForms";
import { ExpenseList, shiftMonth } from "./Expenses";
import {
  EXPENSE_CATEGORIES, NEGATIVE_CATEGORIES, REGION_FLAG, REGION_LABEL,
  type Expense, type Region,
} from "../lib/constants";
import {
  currentMonthKey, expensesInMonth, fmt, fmtTWD, lastMonths, monthLabel, monthlyAmount,
  netWorthTWD, sumByCategory, toTWD, totalExpenseTWD, totalMonthlyIncomeTWD,
} from "../lib/finance";

const REGION_CARDS: { region: Region; currency: "TWD" | "VND" | "USD" }[] = [
  { region: "TW", currency: "TWD" },
  { region: "VN", currency: "VND" },
  { region: "US", currency: "USD" },
];

export default function Overview() {
  const { assets, incomes, expenses, rates, refresh } = useStore();
  const rateMap = rates.rates;

  const [month, setMonth] = useState(currentMonthKey());
  const [tab, setTab] = useState<Region | "ALL">("ALL");
  const [editing, setEditing] = useState<Expense | "new" | null>(null);

  const netWorth = netWorthTWD(assets, rateMap);
  const monthlyIncome = totalMonthlyIncomeTWD(incomes, rateMap);
  const thisMonth = expensesInMonth(expenses, currentMonthKey());
  const thisMonthTotal = totalExpenseTWD(thisMonth, rateMap);

  const incomeByCur = (cur: string) =>
    incomes.filter((i) => i.currency === cur).reduce((s, i) => s + monthlyAmount(i), 0);
  const expenseByCur = (cur: string) =>
    thisMonth.filter((e) => e.currency === cur).reduce((s, e) => s + e.amount, 0);

  // 近 6 個月分類支出折線
  const line6 = useMemo(
    () =>
      lastMonths(6).map((ym) => {
        const byCat = sumByCategory(expensesInMonth(expenses, ym), rateMap);
        const row: Record<string, number | string> = { label: monthLabel(ym) };
        for (const c of EXPENSE_CATEGORIES) row[c.label] = Math.round(byCat[c.value] ?? 0);
        return row;
      }),
    [expenses, rateMap],
  );

  // 近 4 個月支出長條(月曆助手)
  const bar4 = useMemo(
    () =>
      lastMonths(4).map((ym) => ({
        label: monthLabel(ym),
        支出: Math.round(totalExpenseTWD(expensesInMonth(expenses, ym), rateMap)),
      })),
    [expenses, rateMap],
  );

  // 花費記錄卡(可切月份 + 地區篩選)
  const recordItems = useMemo(() => {
    const inMonth = expensesInMonth(expenses, month);
    return tab === "ALL" ? inMonth : inMonth.filter((e) => e.region === tab);
  }, [expenses, month, tab]);

  // 當月分類花費
  const monthByCat = useMemo(() => sumByCategory(expensesInMonth(expenses, month), rateMap), [expenses, month, rateMap]);
  const monthCatRows = EXPENSE_CATEGORIES.filter((c) => (monthByCat[c.value] ?? 0) > 0).map((c) => ({
    label: `${c.icon} ${c.label}`,
    value: monthByCat[c.value],
    color: c.color,
  }));
  const monthCatMax = Math.max(1, ...monthCatRows.map((r) => r.value));

  const save = async (values: Record<string, unknown>) => {
    if (editing === "new") await post("/api/expenses", values);
    else if (editing) await put(`/api/expenses/${editing.id}`, values);
    await refresh("expenses");
  };
  const remove = async (e: Expense) => {
    if (!confirm(`確定刪除「${e.name}」?`)) return;
    await del(`/api/expenses/${e.id}`);
    await refresh("expenses");
  };

  const today = new Date();
  const [y, m] = month.split("-");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">財務總覽</h1>
        <p className="mt-1 text-sm text-slate-500">
          {today.getFullYear()}/{today.getMonth() + 1}/{today.getDate()} ·
          地區:{(["TW", "VN", "US"] as Region[]).map((r) => REGION_FLAG[r]).join(" ")} ·
          匯率 {rates.updated_at ? `${rates.updated_at.slice(11, 16)} 更新` : "載入中"}
        </p>
      </div>

      <Card className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
        <p className="text-sm text-blue-100">總淨資產(TWD)</p>
        <p className="mt-1 text-4xl font-bold">{fmtTWD(netWorth)}</p>
        <p className="mt-2 text-xs text-blue-200">=(現金 + 投資 + 不動產 + 勞退)−(負債 + 保險)</p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {REGION_CARDS.map(({ region, currency }) => {
          const regionAssets = assets.filter((a) => a.region === region && !NEGATIVE_CATEGORIES.includes(a.category));
          const local = regionAssets.filter((a) => a.currency === currency).reduce((s, a) => s + a.amount, 0);
          const twd = regionAssets.reduce((s, a) => s + toTWD(a.amount, a.currency, rateMap), 0);
          return (
            <Card key={region}>
              <div className="flex items-center justify-between">
                <span className="font-medium">{REGION_FLAG[region]} {REGION_LABEL[region]}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{currency}</span>
              </div>
              <p className="mt-2 text-xl font-bold">{fmt(local, currency)}</p>
              <p className="text-xs text-slate-400">≈ {fmtTWD(twd)} · 共 {regionAssets.length} 筆</p>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="bg-gradient-to-br from-emerald-500 to-green-600 text-white">
          <p className="text-sm text-emerald-100">月均收入狀況</p>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between"><span>TWD 月均</span><span className="font-semibold">{fmt(incomeByCur("TWD"), "TWD")}</span></div>
            <div className="flex justify-between"><span>VND 月均</span><span className="font-semibold">{fmt(incomeByCur("VND"), "VND")}</span></div>
          </div>
          <p className="mt-3 border-t border-white/20 pt-2 text-lg font-bold">合計 {fmtTWD(monthlyIncome)}</p>
        </Card>
        <Card className="bg-gradient-to-br from-orange-500 to-red-500 text-white">
          <p className="text-sm text-orange-100">本月支出狀況</p>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between"><span>TWD 本月</span><span className="font-semibold">{fmt(expenseByCur("TWD"), "TWD")}</span></div>
            <div className="flex justify-between"><span>VND 本月</span><span className="font-semibold">{fmt(expenseByCur("VND"), "VND")}</span></div>
          </div>
          <p className="mt-3 border-t border-white/20 pt-2 text-lg font-bold">合計 {fmtTWD(thisMonthTotal)}</p>
        </Card>
      </div>

      <Card>
        <CardTitle>近 6 個月支出(依分類,TWD)</CardTitle>
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={line6}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis fontSize={12} tickFormatter={(v: number) => (v >= 10000 ? `${v / 10000}萬` : String(v))} />
              <Tooltip formatter={(v) => fmtTWD(Number(v))} />
              <Legend />
              {EXPENSE_CATEGORIES.map((c) => (
                <Line key={c.value} type="monotone" dataKey={c.label} stroke={c.color} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-700">花費記錄</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => setMonth(shiftMonth(month, -1))} className="rounded px-2 hover:bg-slate-100">‹</button>
            <span className="text-sm font-medium">{y}年{Number(m)}月</span>
            <button onClick={() => setMonth(shiftMonth(month, 1))} className="rounded px-2 hover:bg-slate-100">›</button>
            <PrimaryButton onClick={() => setEditing("new")}>+ 新增支出</PrimaryButton>
          </div>
        </div>
        <div className="mb-3">
          <RegionTabs regions={["ALL", "TW", "VN", "OTHER"]} value={tab} onChange={setTab} />
        </div>
        {recordItems.length === 0 ? (
          <EmptyState text="本月尚無花費記錄" action={<PrimaryButton onClick={() => setEditing("new")}>記一筆</PrimaryButton>} />
        ) : (
          <ExpenseList items={recordItems} rates={rateMap} onEdit={setEditing} onDelete={remove} />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>{Number(m)}月分類花費</CardTitle>
          {monthCatRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">本月無花費</p>
          ) : (
            <div className="space-y-2">
              {monthCatRows.map((r) => (
                <div key={r.label} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0">{r.label}</span>
                  <div className="h-3 flex-1 rounded-full bg-slate-100">
                    <div
                      className="h-3 rounded-full"
                      style={{ width: `${(r.value / monthCatMax) * 100}%`, backgroundColor: r.color }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-slate-500">{fmtTWD(r.value)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <CardTitle>月曆助手(近 4 個月支出)</CardTitle>
          <div className="h-52">
            <ResponsiveContainer>
              <BarChart data={bar4} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" fontSize={12} tickFormatter={(v: number) => (v >= 10000 ? `${v / 10000}萬` : String(v))} />
                <YAxis type="category" dataKey="label" fontSize={12} width={64} />
                <Tooltip formatter={(v) => fmtTWD(Number(v))} />
                <Bar dataKey="支出" fill="#f97316" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {editing && (
        <FormModal
          title={editing === "new" ? "新增支出" : "編輯支出"}
          fields={EXPENSE_FIELDS}
          initial={
            editing === "new"
              ? { currency: "TWD", region: "TW", date: new Date().toISOString().slice(0, 10) }
              : editing
          }
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
