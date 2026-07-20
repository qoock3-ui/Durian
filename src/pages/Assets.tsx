import { useMemo, useState } from "react";
import { del, post, put } from "../api";
import { useStore } from "../store";
import { Card, EmptyState, PrimaryButton, RegionBadge, RegionTabs, RowActions } from "../components/ui";
import FormModal from "../components/FormModal";
import { ASSET_FIELDS } from "../components/entityForms";
import { ASSET_CATEGORY_LABEL, ASSET_GROUPS, NEGATIVE_CATEGORIES, type Asset, type Region } from "../lib/constants";
import { fmt, fmtTWD, toTWD } from "../lib/finance";

export default function Assets() {
  const { assets, rates, refresh } = useStore();
  const [tab, setTab] = useState<Region | "ALL">("ALL");
  const [editing, setEditing] = useState<Asset | "new" | null>(null);

  const filtered = useMemo(() => (tab === "ALL" ? assets : assets.filter((a) => a.region === tab)), [assets, tab]);

  const twSum = assets.filter((a) => a.region === "TW" && !NEGATIVE_CATEGORIES.includes(a.category) && a.currency === "TWD").reduce((s, a) => s + a.amount, 0);
  const vnSum = assets.filter((a) => a.region === "VN" && !NEGATIVE_CATEGORIES.includes(a.category) && a.currency === "VND").reduce((s, a) => s + a.amount, 0);
  const liabilitySum = assets.filter((a) => a.category === "liability").reduce((s, a) => s + toTWD(a.amount, a.currency, rates.rates), 0);

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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">資產</h1>
        <PrimaryButton onClick={() => setEditing("new")}>+ 新增資產</PrimaryButton>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">🇹🇼 台灣資產(TWD)</p>
          <p className="mt-1 text-xl font-bold text-blue-700">{fmt(twSum, "TWD")}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">🇻🇳 越南資產(VND)</p>
          <p className="mt-1 text-xl font-bold text-red-700">{fmt(vnSum, "VND")}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">💳 負債總計</p>
          <p className="mt-1 text-xl font-bold text-slate-700">{fmtTWD(liabilitySum)}</p>
        </Card>
      </div>

      <RegionTabs regions={["ALL", "TW", "VN", "US", "OTHER"]} value={tab} onChange={setTab} />

      {filtered.length === 0 ? (
        <Card>
          <EmptyState text="尚無資產資料" action={<PrimaryButton onClick={() => setEditing("new")}>新增第一筆資產</PrimaryButton>} />
        </Card>
      ) : (
        ASSET_GROUPS.map((group) => {
          const items = filtered.filter((a) => group.items.some((i) => i.value === a.category));
          if (items.length === 0) return null;
          const subtotal = items.reduce((s, a) => s + toTWD(a.amount, a.currency, rates.rates), 0);
          return (
            <Card key={group.group}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">{group.icon} {group.group}</h2>
                <span className="text-sm text-slate-500">小計 {fmtTWD(subtotal)}</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {items.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{a.name}</span>
                        <RegionBadge region={a.region} />
                      </div>
                      <div className="text-xs text-slate-400">
                        {ASSET_CATEGORY_LABEL[a.category]}
                        {a.note ? ` · ${a.note}` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{fmt(a.amount, a.currency)}</div>
                      {a.currency !== "TWD" && (
                        <div className="text-xs text-slate-400">≈ {fmtTWD(toTWD(a.amount, a.currency, rates.rates))}</div>
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
          fields={ASSET_FIELDS}
          initial={editing === "new" ? { currency: "TWD", region: "TW" } : editing}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
