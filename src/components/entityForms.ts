import type { Field } from "./FormModal";
import type { CategoryIndex } from "../lib/categories";
import { CURRENCIES, FREQUENCIES, REGIONS, REGION_LABEL } from "../lib/constants";

const regionField: Field = {
  name: "region", label: "地區", type: "select", required: true,
  options: REGIONS.map((r) => ({ value: r, label: REGION_LABEL[r] })),
};
const amountField: Field = { name: "amount", label: "金額", type: "number", required: true };
const currencyField: Field = {
  name: "currency", label: "幣別", type: "select", required: true,
  options: CURRENCIES.map((c) => ({ value: c, label: c })),
};
const noteField: Field = { name: "note", label: "備註", type: "textarea" };

/**
 * 分類是動態的,表單欄位得跟著使用者當下的分類表產生。
 * onAdd 會在標籤旁多出一個「＋ 新增分類」入口,讓人不必先跑一趟分類管理。
 */
const categoryField = (
  cats: CategoryIndex,
  kind: "asset" | "income",
  label: string,
  name: string,
  onAdd?: () => void,
): Field => ({
  name,
  label,
  type: "select",
  required: true,
  onAdd,
  addLabel: "＋ 新增分類",
  groups: cats.groups(kind).map((g) => ({
    group: g.group,
    items: g.items.map((c) => ({ value: c.key, label: `${c.icon} ${c.label}` })),
  })),
});

export const assetFields = (cats: CategoryIndex, onAddCategory?: () => void): Field[] => [
  { name: "name", label: "資產名稱", type: "text", required: true },
  categoryField(cats, "asset", "類別", "category", onAddCategory),
  regionField, amountField, currencyField, noteField,
];

export const incomeFields = (cats: CategoryIndex, onAddCategory?: () => void): Field[] => [
  { name: "name", label: "收入名稱", type: "text", required: true },
  categoryField(cats, "income", "類型", "type", onAddCategory),
  regionField, amountField, currencyField,
  {
    name: "frequency", label: "頻率", type: "select", required: true,
    options: FREQUENCIES.map((f) => ({ value: f.value, label: f.label })),
  },
  noteField,
];

/**
 * 手動輸入發票。必填只有對獎與記帳真正需要的那三項:號碼、日期、金額。
 * 店名與品項是 QR Code 裡沒有的東西,只有手動這條路填得進來,所以擺在前面。
 */
export const invoiceFields = (cats: CategoryIndex, onAddCategory?: () => void): Field[] => [
  { name: "inv_num", label: "發票號碼(如 AB12345678)", type: "text", required: true },
  { name: "inv_date", label: "開立日期", type: "date", required: true },
  { name: "total_amount", label: "金額(含稅)", type: "number", required: true },
  { name: "seller_name", label: "店名", type: "text" },
  { name: "items", label: "購買品項(用逗號或換行分隔)", type: "textarea" },
  {
    name: "category", label: "分類(留空就依品項自動判斷)", type: "select",
    onAdd: onAddCategory,
    addLabel: "＋ 新增分類",
    options: cats.list("expense").map((c) => ({ value: c.key, label: `${c.icon} ${c.label}` })),
  },
  { name: "random_code", label: "隨機碼(4 碼,兌獎時櫃台會核對)", type: "text" },
];

export const expenseFields = (cats: CategoryIndex, onAddCategory?: () => void): Field[] => [
  { name: "name", label: "項目名稱", type: "text", required: true },
  {
    name: "category", label: "類別", type: "select", required: true,
    onAdd: onAddCategory,
    addLabel: "＋ 新增分類",
    options: cats.list("expense").map((c) => ({ value: c.key, label: `${c.icon} ${c.label}` })),
  },
  regionField, amountField, currencyField,
  { name: "date", label: "日期", type: "date", required: true },
  noteField,
];
