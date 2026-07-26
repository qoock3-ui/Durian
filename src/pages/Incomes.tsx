import { useState } from "react";
import { del, post, put } from "../api";
import { useStore } from "../store";
import { Badge, Bubble, Card, EmptyState, PrimaryButton, RegionBadge, RowActions } from "../components/ui";
import FormModal from "../components/FormModal";
import { incomeFields } from "../components/entityForms";
import { FREQUENCY_LABEL, type Income } from "../lib/constants";
import { fmt, fmtTWD, monthlyAmount, totalMonthlyIncomeTWD } from "../lib/finance";

export default function Incomes() {
  const { incomes, rates, refresh, cats } = useStore();
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
        cats.groups("income").map((group) => {
          const items = incomes.filter((i) => group.items.some((c) => c.key === i.type));
          if (items.length === 0) return null;
          return (
            <Card key={group.group}>
              <div className="mb-2 flex items-center gap-3">
                <Bubble tint={group.items[0].tint} size="sm">
                  {group.items[0].icon}
                </Bubble>
                <h2 className="font-round font-bold">{group.group}</h2>
              </div>
              <ul className="divide-y-2 divide-line-soft">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 py-2.5">
                    <Bubble tint={cats.tint("income", i.type)} size="sm">
                      {cats.icon("income", i.type)}
                    </Bubble>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate font-medium">{i.name}</span>
                        <RegionBadge region={i.region} />
                        <Badge className="bg-p-mint">{FREQUENCY_LABEL[i.frequency]}</Badge>
                      </div>
                      <div className="truncate text-xs text-ink-3">
                        {cats.label("income", i.type)}
                        {i.note ? ` · ${i.note}` : ""}
                      </div>
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
          fields={incomeFields(cats)}
          initial={
            editing === "new"
              ? { currency: "TWD", region: "TW", frequency: "monthly", type: cats.list("income")[0]?.key ?? "" }
              : editing
          }
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
