import { useMemo, useState } from "react";
import { del, post, put } from "../api";
import { useStore } from "../store";
import { Bubble, Card, EmptyState, MonthNav, PrimaryButton, RegionBadge, RegionTabs, RowActions } from "../components/ui";
import FormModal from "../components/FormModal";
import { expenseFields } from "../components/entityForms";
import { type Expense, type Region } from "../lib/constants";
import { currentMonthKey, expensesInMonth, fmt, fmtTWD, toTWD, totalExpenseTWD } from "../lib/finance";

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 單筆花費列。不給 onEdit/onDelete 時不顯示操作鈕(總覽的最近交易用)。 */
export function ExpenseRow({
  e,
  rates,
  onEdit,
  onDelete,
  showDate = true,
}: {
  e: Expense;
  rates: Record<string, number>;
  onEdit?: (e: Expense) => void;
  onDelete?: (e: Expense) => void;
  showDate?: boolean;
}) {
  const { cats } = useStore();
  const label = cats.label("expense", e.category);
  // 快速記帳留空名稱時會帶入分類名,此時副標不再重複一次分類
  const sub = [showDate ? e.date : null, e.name === label ? null : label, e.note]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex items-center gap-3 py-2.5">
      <Bubble tint={cats.tint("expense", e.category)}>{cats.icon("expense", e.category)}</Bubble>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{e.name}</span>
          <RegionBadge region={e.region} />
        </div>
        <div className="truncate text-xs text-ink-3">{sub || " "}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="tnum font-round text-sm font-bold sm:text-base">{fmt(e.amount, e.currency)}</div>
        {e.currency !== "TWD" && (
          <div className="tnum text-xs text-ink-3">≈ {fmtTWD(toTWD(e.amount, e.currency, rates))}</div>
        )}
      </div>
      {onEdit && onDelete && <RowActions onEdit={() => onEdit(e)} onDelete={() => onDelete(e)} />}
    </li>
  );
}

export function ExpenseList({
  items,
  rates,
  onEdit,
  onDelete,
  showDate = true,
}: {
  items: Expense[];
  rates: Record<string, number>;
  onEdit?: (e: Expense) => void;
  onDelete?: (e: Expense) => void;
  showDate?: boolean;
}) {
  return (
    <ul className="divide-y-2 divide-line-soft">
      {items.map((e) => (
        <ExpenseRow key={e.id} e={e} rates={rates} onEdit={onEdit} onDelete={onDelete} showDate={showDate} />
      ))}
    </ul>
  );
}

/** 依日期由新到舊分組,每組顯示當日小計 */
function groupByDay(items: Expense[]): { date: string; items: Expense[] }[] {
  const map = new Map<string, Expense[]>();
  for (const e of items) {
    const list = map.get(e.date);
    if (list) list.push(e);
    else map.set(e.date, [e]);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, list]) => ({ date, items: list }));
}

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

function dayLabel(date: string, today: string): string {
  const [, m, d] = date.split("-").map(Number);
  const w = WEEKDAY[new Date(date + "T00:00:00").getDay()];
  return `${m} 月 ${d} 日 · 週${w}${date === today ? " · 今天" : ""}`;
}

export default function Expenses() {
  const { expenses, rates, refresh, cats } = useStore();
  const [month, setMonth] = useState(currentMonthKey());
  const [tab, setTab] = useState<Region | "ALL">("ALL");
  const [editing, setEditing] = useState<Expense | "new" | null>(null);

  const monthItems = useMemo(() => {
    const inMonth = expensesInMonth(expenses, month);
    return tab === "ALL" ? inMonth : inMonth.filter((e) => e.region === tab);
  }, [expenses, month, tab]);

  const days = useMemo(() => groupByDay(monthItems), [monthItems]);
  const monthTotal = totalExpenseTWD(monthItems, rates.rates);

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

  const [y, m] = month.split("-");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-round text-2xl font-bold">花費</h1>
        <PrimaryButton onClick={() => setEditing("new")}>＋ 新增花費</PrimaryButton>
      </div>

      <MonthNav
        label={`${y} 年 ${Number(m)} 月`}
        onPrev={() => setMonth(shiftMonth(month, -1))}
        onNext={() => setMonth(shiftMonth(month, 1))}
      />

      <Card tint="bg-p-butter">
        <p className="text-sm text-ink-2">本月支出合計</p>
        <p className="tnum mt-1 font-round text-3xl font-bold">{fmtTWD(monthTotal)}</p>
        <p className="tnum mt-1 text-xs text-ink-2">共 {monthItems.length} 筆</p>
      </Card>

      <RegionTabs regions={["ALL", "TW", "VN", "US", "OTHER"]} value={tab} onChange={setTab} />

      {days.length === 0 ? (
        <Card>
          <EmptyState
            text={`${Number(m)} 月尚無花費記錄`}
            action={<PrimaryButton onClick={() => setEditing("new")}>記一筆</PrimaryButton>}
          />
        </Card>
      ) : (
        days.map((day) => (
          <Card key={day.date}>
            <div className="flex items-baseline justify-between border-b-2 border-dashed border-line-soft pb-2">
              <span className="font-round text-sm font-bold">{dayLabel(day.date, today)}</span>
              <span className="tnum text-xs text-ink-3">
                {fmtTWD(totalExpenseTWD(day.items, rates.rates))}
              </span>
            </div>
            <ExpenseList
              items={day.items}
              rates={rates.rates}
              onEdit={setEditing}
              onDelete={remove}
              showDate={false}
            />
          </Card>
        ))
      )}

      {editing && (
        <FormModal
          title={editing === "new" ? "新增花費" : "編輯花費"}
          fields={expenseFields(cats)}
          initial={
            editing === "new"
              ? {
                  currency: "TWD",
                  region: "TW",
                  category: cats.list("expense")[0]?.key ?? "",
                  date: new Date().toISOString().slice(0, 10),
                }
              : editing
          }
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
