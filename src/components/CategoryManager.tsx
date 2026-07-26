import { useState } from "react";
import { del, post, put } from "../api";
import { useStore } from "../store";
import { Bubble, GhostButton, ModalShell, PrimaryButton, inputClass } from "./ui";
import { TINTS, type Category, type CategoryKind } from "../lib/constants";

const KIND_LABEL: Record<CategoryKind, string> = { expense: "支出", income: "收入", asset: "資產" };
/** 依使用頻率排,支出最常用擺第一個(也是預設選取的那個) */
const KIND_ORDER: CategoryKind[] = ["expense", "income", "asset"];

const QUICK_ICONS = [
  "🍜", "☕", "🍺", "🚗", "🚌", "✈️", "🏠", "💡", "🎮", "🎬",
  "🏥", "💊", "🛍️", "👕", "💻", "📚", "🐶", "💇", "🎁", "🧧",
  "💼", "💹", "🏦", "🏪", "🚙", "💎", "🪙", "🤝", "📦", "🏷️",
];

type Draft = { label: string; group_name: string; icon: string; tint: string; sign: number };

const emptyDraft = (group: string): Draft => ({
  label: "",
  group_name: group,
  icon: "🏷️",
  tint: "bg-p-stone",
  sign: 1,
});

export default function CategoryManager({ onClose }: { onClose: () => void }) {
  const { cats, refresh } = useStore();
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [editing, setEditing] = useState<Category | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const groups = cats.groups(kind);
  const archived = cats.all(kind).filter((c) => c.archived);
  const groupNames = [...new Set(cats.all(kind).map((c) => c.group_name))];

  const startAdd = () => {
    setEditing(null);
    setDraft(emptyDraft(groupNames[0] ?? "其他"));
    setError("");
  };

  const startEdit = (c: Category) => {
    setEditing(c);
    setDraft({ label: c.label, group_name: c.group_name, icon: c.icon, tint: c.tint, sign: c.sign });
    setError("");
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.label.trim()) {
      setError("請輸入名稱");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editing) {
        await put(`/api/categories/${editing.id}`, { ...draft, archived: editing.archived });
      } else {
        await post("/api/categories", { ...draft, kind });
      }
      await refresh("categories");
      setDraft(null);
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const archive = async (c: Category) => {
    if (!confirm(`把「${c.label}」從選單收起來?\n已經用這個分類記過的資料不會受影響。`)) return;
    await del(`/api/categories/${c.id}`);
    await refresh("categories");
  };

  const restore = async (c: Category) => {
    await put(`/api/categories/${c.id}`, {
      label: c.label, group_name: c.group_name, icon: c.icon, tint: c.tint, archived: false,
    });
    await refresh("categories");
  };

  const tab = (on: boolean) =>
    `flex-1 rounded-full border-2 px-3 py-1.5 text-sm transition ${
      on ? "border-ink bg-p-butter font-bold text-ink" : "border-line-soft text-ink-2 hover:border-ink"
    }`;

  return (
    <ModalShell title="分類管理" onClose={onClose}>
      <div className="mb-4 flex gap-2">
        {KIND_ORDER.map((k) => (
          <button
            key={k}
            onClick={() => {
              setKind(k);
              setDraft(null);
              setEditing(null);
            }}
            className={tab(kind === k)}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {draft ? (
        <div className="space-y-3 rounded-mid border-2 border-ink bg-card p-4">
          <p className="font-round text-sm font-bold">
            {editing ? `編輯「${editing.label}」` : `新增${KIND_LABEL[kind]}分類`}
          </p>

          <label className="block">
            <span className="mb-1 block text-xs text-ink-2">名稱</span>
            <input
              className={inputClass}
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="例如:寵物"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-ink-2">分組(可輸入新的)</span>
            <input
              className={inputClass}
              list="cm-groups"
              value={draft.group_name}
              onChange={(e) => setDraft({ ...draft, group_name: e.target.value })}
            />
            <datalist id="cm-groups">
              {groupNames.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </label>

          <div>
            <span className="mb-1 block text-xs text-ink-2">圖示</span>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {QUICK_ICONS.map((ic) => (
                <button
                  key={ic}
                  onClick={() => setDraft({ ...draft, icon: ic })}
                  className={`grid h-8 w-8 place-items-center rounded-full border-2 text-base ${
                    draft.icon === ic ? "border-mango-d bg-p-butter" : "border-line-soft"
                  }`}
                >
                  {ic}
                </button>
              ))}
            </div>
            <input
              className={inputClass}
              value={draft.icon}
              onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
              placeholder="或直接貼上任何 emoji"
            />
          </div>

          <div>
            <span className="mb-1 block text-xs text-ink-2">顏色</span>
            <div className="flex flex-wrap gap-2">
              {TINTS.map((t) => (
                <button
                  key={t}
                  onClick={() => setDraft({ ...draft, tint: t })}
                  aria-label={t}
                  className={`h-8 w-8 rounded-full border-2 ${t} ${
                    draft.tint === t ? "border-mango-d ring-2 ring-mango-d" : "border-ink"
                  }`}
                />
              ))}
            </div>
          </div>

          {kind === "asset" && !editing && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.sign === -1}
                onChange={(e) => setDraft({ ...draft, sign: e.target.checked ? -1 : 1 })}
                className="h-4 w-4"
              />
              這是負債(計算淨資產時要扣除)
            </label>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2">
            <GhostButton onClick={() => { setDraft(null); setEditing(null); }}>取消</GhostButton>
            <PrimaryButton onClick={save} disabled={busy}>
              {busy ? "儲存中…" : "儲存"}
            </PrimaryButton>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.group}>
                <p className="mb-1.5 font-round text-sm font-bold text-ink-2">{g.group}</p>
                <ul className="divide-y-2 divide-line-soft rounded-mid border-2 border-ink bg-card px-3">
                  {g.items.map((c) => (
                    <li key={c.id} className="flex items-center gap-2.5 py-2">
                      <Bubble tint={c.tint} size="sm">
                        {c.icon}
                      </Bubble>
                      <span className="flex-1 truncate text-sm">{c.label}</span>
                      {c.sign === -1 && <span className="text-xs text-danger">負債</span>}
                      <button
                        onClick={() => startEdit(c)}
                        aria-label={`編輯 ${c.label}`}
                        className="grid h-7 w-7 place-items-center rounded-full text-xs hover:bg-p-sky"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => archive(c)}
                        aria-label={`收起 ${c.label}`}
                        className="grid h-7 w-7 place-items-center rounded-full text-xs hover:bg-p-rose"
                      >
                        🚫
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {archived.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 font-round text-sm font-bold text-ink-3">已收起</p>
              <ul className="divide-y-2 divide-line-soft rounded-mid border-2 border-line-soft px-3">
                {archived.map((c) => (
                  <li key={c.id} className="flex items-center gap-2.5 py-2 opacity-60">
                    <Bubble tint={c.tint} size="sm">
                      {c.icon}
                    </Bubble>
                    <span className="flex-1 truncate text-sm">{c.label}</span>
                    <button onClick={() => restore(c)} className="text-xs text-mango-d hover:underline">
                      復原
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <PrimaryButton onClick={startAdd}>＋ 新增{KIND_LABEL[kind]}分類</PrimaryButton>
          </div>
        </>
      )}
    </ModalShell>
  );
}
