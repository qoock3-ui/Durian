import type { Category, CategoryKind } from "./constants";

/**
 * 分類清單的查詢輔助。分類是使用者可增修的資料,所以所有畫面
 * 都經過這裡取用,不再各自 import 一份寫死的常數。
 */
export type CategoryIndex = {
  /** 某一類的可用分類(不含封存),已依 sort 排好 */
  list: (kind: CategoryKind) => Category[];
  /** 含封存,分類管理頁用 */
  all: (kind: CategoryKind) => Category[];
  /** 依 key 取單一分類;查不到回傳 undefined */
  get: (kind: CategoryKind, key: string) => Category | undefined;
  /** 顯示用標籤;查不到時回傳原始 key,不讓畫面變空白 */
  label: (kind: CategoryKind, key: string) => string;
  icon: (kind: CategoryKind, key: string) => string;
  tint: (kind: CategoryKind, key: string) => string;
  /** 淨資產正負號,查不到當作正的 */
  sign: (key: string) => number;
  /** 依 group_name 分組(不含封存),維持 sort 順序 */
  groups: (kind: CategoryKind) => { group: string; items: Category[] }[];
};

export function buildIndex(categories: Category[]): CategoryIndex {
  const byKind = new Map<string, Category[]>();
  const byKey = new Map<string, Category>();
  for (const c of categories) {
    const arr = byKind.get(c.kind);
    if (arr) arr.push(c);
    else byKind.set(c.kind, [c]);
    byKey.set(`${c.kind}:${c.key}`, c);
  }
  for (const arr of byKind.values()) arr.sort((a, b) => a.sort - b.sort || a.id - b.id);

  const all = (kind: CategoryKind) => byKind.get(kind) ?? [];
  const list = (kind: CategoryKind) => all(kind).filter((c) => !c.archived);
  const get = (kind: CategoryKind, key: string) => byKey.get(`${kind}:${key}`);

  return {
    list,
    all,
    get,
    label: (kind, key) => get(kind, key)?.label ?? key,
    icon: (kind, key) => get(kind, key)?.icon ?? "🏷️",
    tint: (kind, key) => get(kind, key)?.tint ?? "bg-p-stone",
    sign: (key) => get("asset", key)?.sign ?? 1,
    groups: (kind) => {
      const out: { group: string; items: Category[] }[] = [];
      for (const c of list(kind)) {
        const last = out[out.length - 1];
        if (last && last.group === c.group_name) last.items.push(c);
        else {
          const existing = out.find((g) => g.group === c.group_name);
          if (existing) existing.items.push(c);
          else out.push({ group: c.group_name, items: [c] });
        }
      }
      return out;
    },
  };
}
