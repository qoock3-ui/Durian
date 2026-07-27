import { useMemo, useState } from "react";
import { del, put } from "../api";
import { useStore } from "../store";
import { Bubble, Card, EmptyState, PrimaryButton, RegionBadge, RegionTabs, RowActions, Toast } from "../components/ui";
import FormModal from "../components/FormModal";
import QuickEntry from "../components/QuickEntry";
import CategoryManager from "../components/CategoryManager";
import { incomeFields } from "../components/entityForms";
import { FREQUENCY_LABEL, REGION_FLAG, type Income, type Region } from "../lib/constants";
import { fmt, fmtTWD, monthlyAmount, toTWD, totalMonthlyIncomeTWD } from "../lib/finance";

export default function Incomes() {
  const { incomes, rates, refresh, cats } = useStore();
  const [tab, setTab] = useState<Region | "ALL">("ALL");
  // 新增走計算機面板,編輯走完整表單
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Income | null>(null);
  const [toast, setToast] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [patch, setPatch] = useState<Record<string, string> | undefined>();

  const rateMap = rates.rates;
  const filtered = useMemo(() => (tab === "ALL" ? incomes : incomes.filter((i) => i.region === tab)), [incomes, tab]);

  const monthlyTotal = totalMonthlyIncomeTWD(incomes, rateMap);
  const byRegion = (["TW", "VN", "US"] as Region[]).map((r) => ({
    region: r,
    twd: incomes
      .filter((i) => i.region === r)
      .reduce((s, i) => s + toTWD(monthlyAmount(i), i.currency, rateMap), 0),
  }));

  const save = async (values: Record<string, unknown>) => {
    if (!editing) return;
    await put(`/api/incomes/${editing.id}`, values);
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
        <PrimaryButton onClick={() => setAdding(true)}>＋ 新增收入</PrimaryButton>
      </div>

      <Card tint="bg-p-mint">
        <p className="text-sm text-ink-2">月均收入合計</p>
        <p className="tnum mt-1 font-round text-3xl font-bold">{fmtTWD(monthlyTotal)}</p>
        <p className="tnum mt-1 text-xs text-ink-2">
          年約 {fmtTWD(monthlyTotal * 12)} · 共 {incomes.length} 筆
        </p>
        {/* 地區明細一律換算成 TWD,才能並排比較 */}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t-2 border-dashed border-ink/15 pt-2 text-xs text-ink-2">
          {byRegion.map(({ region, twd }) => (
            <span key={region} className="tnum">
              {REGION_FLAG[region]} {fmtTWD(twd)}
            </span>
          ))}
        </div>
      </Card>

      <RegionTabs regions={["ALL", "TW", "VN", "US", "OTHER"]} value={tab} onChange={setTab} />

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            text={tab === "ALL" ? "尚無收入資料" : "這個地區還沒有收入"}
            action={<PrimaryButton onClick={() => setAdding(true)}>新增第一筆收入</PrimaryButton>}
          />
        </Card>
      ) : (
        cats.groups("income").map((group) => {
          const items = filtered.filter((i) => group.items.some((c) => c.key === i.type));
          if (items.length === 0) return null;
          const subtotal = items.reduce((s, i) => s + toTWD(monthlyAmount(i), i.currency, rateMap), 0);
          return (
            <Card key={group.group}>
              <div className="flex items-center justify-between border-b-2 border-dashed border-line-soft pb-2">
                <span className="font-round text-sm font-bold">
                  {group.items[0].icon} {group.group}
                </span>
                <span className="tnum text-xs text-ink-3">月均 {fmtTWD(subtotal)}</span>
              </div>
              <ul className="divide-y-2 divide-line-soft">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 py-2.5 sm:gap-3">
                    <Bubble tint={cats.tint("income", i.type)} size="sm">
                      {cats.icon("income", i.type)}
                    </Bubble>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{i.name}</span>
                        <RegionBadge region={i.region} />
                      </div>
                      {/* 頻率放副標,不跟名稱搶標題列的寬度 */}
                      <div className="truncate text-xs text-ink-3">
                        {FREQUENCY_LABEL[i.frequency]} · {cats.label("income", i.type)}
                        {i.note ? ` · ${i.note}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="tnum font-round text-xs font-bold sm:text-base">
                        {fmt(i.amount, i.currency)}
                      </div>
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

      {adding && <QuickEntry kind="income" onClose={() => setAdding(false)} onSaved={setToast} />}

      {editing && (
        <FormModal
          title="編輯收入"
          fields={incomeFields(cats, () => setAddingCategory(true))}
          initial={editing}
          patch={patch}
          onSubmit={save}
          onClose={() => {
            setEditing(null);
            setPatch(undefined);
          }}
        />
      )}

      {addingCategory && (
        <CategoryManager
          initialKind="income"
          autoAdd
          onCreated={(c) => setPatch({ type: c.key })}
          onClose={() => setAddingCategory(false)}
        />
      )}

      {toast && <Toast text={toast} onDone={() => setToast("")} />}
    </div>
  );
}
