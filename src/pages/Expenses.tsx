import { useMemo, useState } from "react";
import { del, post, put } from "../api";
import { useStore } from "../store";
import { Card, EmptyState, PrimaryButton, RegionBadge, RegionTabs, RowActions } from "../components/ui";
import FormModal from "../components/FormModal";
import { EXPENSE_FIELDS } from "../components/entityForms";
import { EXPENSE_CATEGORIES, type Expense, type Region } from "../lib/constants";
import { currentMonthKey, expensesInMonth, fmt, fmtTWD, toTWD } from "../lib/finance";

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function ExpenseList({
  items,
  rates,
  onEdit,
  onDelete,
}: {
  items: Expense[];
  rates: Record<string, number>;
  onEdit: (e: Expense) => void;
  onDelete: (e: Expense) => void;
}) {
  const catOf = (v: string) => EXPENSE_CATEGORIES.find((c) => c.value === v);
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((e) => (
        <li key={e.id} className="flex items-center gap-3 py-2.5">
          <span className="text-xl">{catOf(e.category)?.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium">{e.name}</span>
              <RegionBadge region={e.region} />
            </div>
            <div className="text-xs text-slate-400">
              {e.date} · {catOf(e.category)?.label}
              {e.note ? ` · ${e.note}` : ""}
            </div>
          </div>
          <div className="text-right">
            <div className="font-semibold">{fmt(e.amount, e.currency)}</div>
            {e.currency !== "TWD" && (
              <div className="text-xs text-slate-400">≈ {fmtTWD(toTWD(e.amount, e.currency, rates))}</div>
            )}
          </div>
          <RowActions onEdit={() => onEdit(e)} onDelete={() => onDelete(e)} />
        </li>
      ))}
    </ul>
  );
}

export default function Expenses() {
  const { expenses, rates, refresh } = useStore();
  const [month, setMonth] = useState(currentMonthKey());
  const [tab, setTab] = useState<Region | "ALL">("ALL");
  const [editing, setEditing] = useState<Expense | "new" | null>(null);

  const monthItems = useMemo(() => {
    const inMonth = expensesInMonth(expenses, month);
    return tab === "ALL" ? inMonth : inMonth.filter((e) => e.region === tab);
  }, [expenses, month, tab]);

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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">花費</h1>
        <PrimaryButton onClick={() => setEditing("new")}>+ 新增花費</PrimaryButton>
      </div>

      <div className="flex items-center justify-center gap-4">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-lg px-3 py-1 text-lg hover:bg-slate-200">‹</button>
        <span className="text-lg font-semibold">{y}年{Number(m)}月</span>
        <button onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-lg px-3 py-1 text-lg hover:bg-slate-200">›</button>
      </div>

      <RegionTabs regions={["ALL", "TW", "VN", "OTHER"]} value={tab} onChange={setTab} />

      <Card>
        {monthItems.length === 0 ? (
          <EmptyState
            text={`${Number(m)}月尚無花費記錄`}
            action={<PrimaryButton onClick={() => setEditing("new")}>記一筆</PrimaryButton>}
          />
        ) : (
          <ExpenseList items={monthItems} rates={rates.rates} onEdit={setEditing} onDelete={remove} />
        )}
      </Card>

      {editing && (
        <FormModal
          title={editing === "new" ? "新增花費" : "編輯花費"}
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
