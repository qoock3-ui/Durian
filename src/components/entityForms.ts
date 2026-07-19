import type { Field } from "./FormModal";
import {
  ASSET_GROUPS, CURRENCIES, EXPENSE_CATEGORIES, FREQUENCIES, INCOME_TYPES,
  REGIONS, REGION_LABEL,
} from "../lib/constants";

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

export const ASSET_FIELDS: Field[] = [
  { name: "name", label: "資產名稱", type: "text", required: true },
  { name: "category", label: "類別", type: "select", required: true, groups: ASSET_GROUPS },
  regionField, amountField, currencyField, noteField,
];

export const INCOME_FIELDS: Field[] = [
  { name: "name", label: "收入名稱", type: "text", required: true },
  {
    name: "type", label: "類型", type: "select", required: true,
    options: INCOME_TYPES.map((t) => ({ value: t.value, label: t.label })),
  },
  regionField, amountField, currencyField,
  {
    name: "frequency", label: "頻率", type: "select", required: true,
    options: FREQUENCIES.map((f) => ({ value: f.value, label: f.label })),
  },
  noteField,
];

export const EXPENSE_FIELDS: Field[] = [
  { name: "name", label: "項目名稱", type: "text", required: true },
  {
    name: "category", label: "類別", type: "select", required: true,
    options: EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: `${c.icon} ${c.label}` })),
  },
  regionField, amountField, currencyField,
  { name: "date", label: "日期", type: "date", required: true },
  noteField,
];
