import { useMemo, useState } from "react";
import { del, post, put } from "../api";
import { useStore } from "../store";
import { Bubble, Card, EmptyState, PrimaryButton, RegionBadge, RegionTabs, RowActions } from "../components/ui";
import FormModal from "../components/FormModal";
import CategoryManager from "../components/CategoryManager";
import { assetFields } from "../components/entityForms";
import { REGION_FLAG, type Asset, type Region } from "../lib/constants";
import { fmt, fmtTWD, netWorthTWD, toTWD } from "../lib/finance";

export default function Assets() {
  const { assets, rates, refresh, cats } = useStore();
  const [tab, setTab] = useState<Region | "ALL">("ALL");
  const [editing, setEditing] = useState<Asset | "new" | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [patch, setPatch] = useState<Record<string, string> | undefined>();

  const rateMap = rates.rates;
  const filtered = useMemo(() => (tab === "ALL" ? assets : assets.filter((a) => a.region === tab)), [assets, tab]);

  const netWorth = netWorthTWD(assets, rateMap, cats.sign);
  // sign 為 -1 的分類即負債,使用者自訂的負債分類也會自動算進來
  const debts = assets.filter((a) => cats.sign(a.category) === -1);
  const debtSum = debts.reduce((s, a) => s + toTWD(a.amount, a.currency, rateMap), 0);
  const grossSum = assets
    .filter((a) => cats.sign(a.category) === 1)
    .reduce((s, a) => s + toTWD(a.amount, a.currency, rateMap), 0);

  const byRegion = (["TW", "VN", "US"] as Region[]).map((r) => ({
    region: r,
    twd: assets
      .filter((a) => a.region === r && cats.sign(a.category) === 1)
      .reduce((s, a) => s + toTWD(a.amount, a.currency, rateMap), 0),
  }));

  const save = async (values: Record<string, unknown>) => {
    if (editing === "new") await post("/api/assets", values);
    else if (editing) await put(`/api/assets/${editing.id}`, values);
    await refresh("assets");
  };

  const remove = async (a: Asset) => {
    if (!confirm(`確定刪除「${a.name}」?`)) return;
    await del(`/api/assets/${a.id}`);
    await refresh("assets");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-round text-2xl font-bold">資產</h1>
        <PrimaryButton onClick={() => setEditing("new")}>＋ 新增資產</PrimaryButton>
      </div>

      <Card tint="bg-p-lilac">
        <p className="text-sm text-ink-2">總淨資產</p>
        <p className="tnum mt-1 font-round text-3xl font-bold">{fmtTWD(netWorth)}</p>
        <p className="tnum mt-1 text-xs text-ink-2">
          資產 {fmtTWD(grossSum)}
          {debtSum > 0 && ` · 負債 −${fmtTWD(debtSum)}`} · 共 {assets.length} 筆
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
            text={tab === "ALL" ? "尚無資產資料" : "這個地區還沒有資產"}
            action={<PrimaryButton onClick={() => setEditing("new")}>新增第一筆資產</PrimaryButton>}
          />
        </Card>
      ) : (
        cats.groups("asset").map((group) => {
          const items = filtered.filter((a) => group.items.some((i) => i.key === a.category));
          if (items.length === 0) return null;
          const subtotal = items.reduce((s, a) => s + toTWD(a.amount, a.currency, rateMap), 0);
          const negative = group.items.some((i) => i.sign === -1);
          return (
            <Card key={group.group}>
              <div className="flex items-center justify-between border-b-2 border-dashed border-line-soft pb-2">
                <span className="font-round text-sm font-bold">
                  {group.items[0].icon} {group.group}
                </span>
                <span className={`tnum text-xs ${negative ? "text-danger" : "text-ink-3"}`}>
                  {negative ? "−" : ""}
                  {fmtTWD(subtotal)}
                </span>
              </div>
              {/* 資產名稱與外幣金額都可能很長,氣泡與金額都縮一級留寬度給名稱 */}
              <ul className="divide-y-2 divide-line-soft">
                {items.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 py-2.5 sm:gap-3">
                    <Bubble tint={cats.tint("asset", a.category)} size="sm">
                      {cats.icon("asset", a.category)}
                    </Bubble>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{a.name}</span>
                        <RegionBadge region={a.region} />
                      </div>
                      <div className="truncate text-xs text-ink-3">
                        {cats.label("asset", a.category)}
                        {a.note ? ` · ${a.note}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="tnum font-round text-xs font-bold sm:text-base">
                        {fmt(a.amount, a.currency)}
                      </div>
                      {a.currency !== "TWD" && (
                        <div className="tnum text-xs text-ink-3">
                          ≈ {fmtTWD(toTWD(a.amount, a.currency, rateMap))}
                        </div>
                      )}
                    </div>
                    <RowActions onEdit={() => setEditing(a)} onDelete={() => remove(a)} />
                  </li>
                ))}
              </ul>
            </Card>
          );
        })
      )}

      {editing && (
        <FormModal
          title={editing === "new" ? "新增資產" : "編輯資產"}
          fields={assetFields(cats, () => setAddingCategory(true))}
          initial={
            editing === "new"
              ? { currency: "TWD", region: "TW", category: cats.list("asset")[0]?.key ?? "" }
              : editing
          }
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
          initialKind="asset"
          autoAdd
          onCreated={(c) => setPatch({ category: c.key })}
          onClose={() => setAddingCategory(false)}
        />
      )}
    </div>
  );
}
