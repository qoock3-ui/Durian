import { useState } from "react";
import { del, post, put } from "../api";
import { useStore } from "../store";
import { Badge, Bubble, Card, EmptyState, PrimaryButton, RegionBadge, RowActions } from "../components/ui";
import FormModal from "../components/FormModal";
import { INCOME_FIELDS } from "../components/entityForms";
import { FREQUENCY_LABEL, INCOME_TYPES, type Income } from "../lib/constants";
import { fmt, fmtTWD, monthlyAmount, totalMonthlyIncomeTWD } from "../lib/finance";

export default function Incomes() {
  const { incomes, rates, refresh } = useStore();
  const [editing, setEditing] = useState<Income | "new" | null>(null);

  const monthlyByCur = (cur: string) =>
    incomes.filter((i) => i.currency === cur).reduce((s, i) => s + monthlyAmount(i), 0);
  const monthlyTotal = totalMonthlyIncomeTWD(incomes, rates.rates);

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-round text-2xl font-bold">收入</h1>
        <PrimaryButton onClick={() => setEditing("new")}>＋ 新增收入</PrimaryButton>
      </div>

      <Card tint="bg-p-mint">
        <p className="text-sm text-ink-2">月均收入合計(TWD)</p>
        <p className="tnum mt-1 font-round text-3xl font-bold">{fmtTWD(monthlyTotal)}</p>
        <p className="tnum mt-1 text-xs text-ink-2">年約 {fmtTWD(monthlyTotal * 12)}</p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {(["TWD", "VND"] as const).map((cur) => {
          const monthly = monthlyByCur(cur);
          return (
            <Card key={cur}>
              <p className="text-sm text-ink-2">月均收入({cur})</p>
              <p className="tnum mt-1 font-round text-xl font-bold">{fmt(monthly, cur)}</p>
              <p className="tnum mt-1 text-xs text-ink-3">年約 {fmt(monthly * 12, cur)}</p>
            </Card>
          );
        })}
      </div>

      {incomes.length === 0 ? (
        <Card>
          <EmptyState
            text="尚無收入資料"
            action={<PrimaryButton onClick={() => setEditing("new")}>新增第一筆收入</PrimaryButton>}
          />
        </Card>
      ) : (
        INCOME_TYPES.map((type) => {
          const items = incomes.filter((i) => i.type === type.value);
          if (items.length === 0) return null;
          return (
            <Card key={type.value}>
              <div className="mb-2 flex items-center gap-3">
                <Bubble tint={type.tint} size="sm">
                  {type.icon}
                </Bubble>
                <h2 className="font-round font-bold">{type.label}</h2>
              </div>
              <ul className="divide-y-2 divide-line-soft">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{i.name}</span>
                        <RegionBadge region={i.region} />
                        <Badge className="bg-p-mint">{FREQUENCY_LABEL[i.frequency]}</Badge>
                      </div>
                      {i.note && <div className="text-xs text-ink-3">{i.note}</div>}
                    </div>
                    <div className="text-right">
                      <div className="tnum font-round text-base font-bold">{fmt(i.amount, i.currency)}</div>
                      {i.frequency === "yearly" && (
                        <div className="tnum text-xs text-ink-3">月均 {fmt(i.amount / 12, i.currency)}</div>
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
