import { useState } from "react";
import { del, post, put } from "../api";
import { useStore } from "../store";
import { Badge, Card, EmptyState, PrimaryButton, RegionBadge, RowActions } from "../components/ui";
import FormModal from "../components/FormModal";
import { INCOME_FIELDS } from "../components/entityForms";
import { FREQUENCY_LABEL, INCOME_TYPES, type Income } from "../lib/constants";
import { fmt, monthlyAmount } from "../lib/finance";

export default function Incomes() {
  const { incomes, refresh } = useStore();
  const [editing, setEditing] = useState<Income | "new" | null>(null);

  const monthlyByCur = (cur: string) =>
    incomes.filter((i) => i.currency === cur).reduce((s, i) => s + monthlyAmount(i), 0);

  const save = async (values: Record<string, unknown>) => {
    if (editing === "new") await post("/api/incomes", values);
    else if (editing) await put(`/api/incomes/${editing.id}`, values);
    await refresh("incomes");
  };

  const remove = async (i: Income) => {
    if (!confirm(`確定刪除「${i.name}」?`)) return;
    await del(`/api/incomes/${i.id}`);
    await refresh("incomes");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">收入</h1>
        <PrimaryButton onClick={() => setEditing("new")}>+ 新增收入</PrimaryButton>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(["TWD", "VND"] as const).map((cur) => {
          const monthly = monthlyByCur(cur);
          return (
            <Card key={cur}>
              <p className="text-sm text-slate-500">月均收入({cur})</p>
              <p className="mt-2 text-3xl font-bold text-emerald-600 md:mt-1 md:text-xl">{fmt(monthly, cur)}</p>
              <p className="mt-1 text-xs text-slate-400 md:mt-0">年約 {fmt(monthly * 12, cur)}</p>
            </Card>
          );
        })}
      </div>

      {incomes.length === 0 ? (
        <Card>
          <EmptyState text="尚無收入資料" action={<PrimaryButton onClick={() => setEditing("new")}>新增第一筆收入</PrimaryButton>} />
        </Card>
      ) : (
        INCOME_TYPES.map((type) => {
          const items = incomes.filter((i) => i.type === type.value);
          if (items.length === 0) return null;
          return (
            <Card key={type.value}>
              <h2 className="mb-3 font-semibold">{type.icon} {type.label}</h2>
              <ul className="divide-y divide-slate-100">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{i.name}</span>
                        <RegionBadge region={i.region} />
                        <Badge className="bg-emerald-100 text-emerald-700">{FREQUENCY_LABEL[i.frequency]}</Badge>
                      </div>
                      {i.note && <div className="text-xs text-slate-400">{i.note}</div>}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold md:text-base">{fmt(i.amount, i.currency)}</div>
                      {i.frequency === "yearly" && (
                        <div className="text-xs text-slate-400">月均 {fmt(i.amount / 12, i.currency)}</div>
                      )}
                    </div>
                    <RowActions onEdit={() => setEditing(i)} onDelete={() => remove(i)} />
                  </li>
                ))}
              </ul>
            </Card>
          );
        })
      )}

      {editing && (
        <FormModal
          title={editing === "new" ? "新增收入" : "編輯收入"}
          fields={INCOME_FIELDS}
          initial={editing === "new" ? { currency: "TWD", region: "TW", frequency: "monthly" } : editing}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
