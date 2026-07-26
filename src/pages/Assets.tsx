import { useMemo, useState } from "react";
import { del, post, put } from "../api";
import { useStore } from "../store";
import { Bubble, Card, EmptyState, PrimaryButton, RegionBadge, RegionTabs, RowActions } from "../components/ui";
import FormModal from "../components/FormModal";
import { assetFields } from "../components/entityForms";
import { REGION_CURRENCY, REGION_FLAG, REGION_LABEL, type Asset, type Region } from "../lib/constants";
import { fmt, fmtTWD, toTWD } from "../lib/finance";

const REGION_CARDS: { region: Region; tint: string }[] = [
  { region: "TW", tint: "bg-p-sky" },
  { region: "VN", tint: "bg-p-rose" },
  { region: "US", tint: "bg-p-lilac" },
];

export default function Assets() {
  const { assets, rates, refresh, cats } = useStore();
  const [tab, setTab] = useState<Region | "ALL">("ALL");
  const [editing, setEditing] = useState<Asset | "new" | null>(null);

  const filtered = useMemo(() => (tab === "ALL" ? assets : assets.filter((a) => a.region === tab)), [assets, tab]);

  // 負債 = 所有 sign 為 -1 的分類,使用者自己新增的負債分類也會自動算進來
  const liabilitySum = assets
    .filter((a) => cats.sign(a.category) === -1)
    .reduce((s, a) => s + toTWD(a.amount, a.currency, rates.rates), 0);

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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {REGION_CARDS.map(({ region, tint }) => {
          const currency = REGION_CURRENCY[region];
          const items = assets.filter((a) => a.region === region && cats.sign(a.category) === 1);
          const local = items.filter((a) => a.currency === currency).reduce((s, a) => s + a.amount, 0);
          const twd = items.reduce((s, a) => s + toTWD(a.amount, a.currency, rates.rates), 0);
          return (
            <Card key={region} tint={tint}>
              <p className="text-sm text-ink-2">
                {REGION_FLAG[region]} {REGION_LABEL[region]}({currency})
              </p>
              {/* 幣別已在標題,金額不再重複前綴——VND 動輒十位數,加前綴會撐破卡片 */}
              <p className="tnum mt-1 break-all font-round text-xl font-bold">{fmt(local)}</p>
              <p className="tnum mt-1 text-xs text-ink-2">
                ≈ {fmtTWD(twd)} · 共 {items.length} 筆
              </p>
            </Card>
          );
        })}
        <Card tint="bg-p-stone">
          <p className="text-sm text-ink-2">💳 負債總計</p>
          <p className="tnum mt-1 font-round text-2xl font-bold text-danger">{fmtTWD(liabilitySum)}</p>
          <p className="tnum mt-1 text-xs text-ink-2">已從淨資產扣除</p>
        </Card>
      </div>

      <RegionTabs regions={["ALL", "TW", "VN", "US", "OTHER"]} value={tab} onChange={setTab} />

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            text="尚無資產資料"
            action={<PrimaryButton onClick={() => setEditing("new")}>新增第一筆資產</PrimaryButton>}
          />
        </Card>
      ) : (
        cats.groups("asset").map((group) => {
          const items = filtered.filter((a) => group.items.some((i) => i.key === a.category));
          if (items.length === 0) return null;
          const subtotal = items.reduce((s, a) => s + toTWD(a.amount, a.currency, rates.rates), 0);
          const negative = group.items.some((i) => i.sign === -1);
          return (
            <Card key={group.group}>
              <div className="mb-2 flex items-center gap-3">
                <Bubble tint={group.items[0].tint} size="sm">
                  {group.items[0].icon}
                </Bubble>
                <h2 className="flex-1 font-round font-bold">{group.group}</h2>
                <span className={`tnum text-sm ${negative ? "text-danger" : "text-ink-2"}`}>
                  {negative ? "−" : ""}
                  {fmtTWD(subtotal)}
                </span>
              </div>
              <ul className="divide-y-2 divide-line-soft">
                {items.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
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
                    <div className="text-right">
                      <div className="tnum font-round text-base font-bold">{fmt(a.amount, a.currency)}</div>
                      {a.currency !== "TWD" && (
                        <div className="tnum text-xs text-ink-3">
                          ≈ {fmtTWD(toTWD(a.amount, a.currency, rates.rates))}
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
          fields={assetFields(cats)}
          initial={
            editing === "new"
              ? { currency: "TWD", region: "TW", category: cats.list("asset")[0]?.key ?? "" }
              : editing
          }
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
