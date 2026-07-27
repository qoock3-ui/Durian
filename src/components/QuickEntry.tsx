import { useEffect, useState } from "react";
import { post } from "../api";
import { useStore } from "../store";
import { Bubble } from "./ui";
import CategoryManager from "./CategoryManager";
import {
  CURRENCIES, FREQUENCIES, REGION_CURRENCY, REGION_FLAG, REGION_LABEL, REGIONS,
  type CategoryKind, type Currency, type Frequency, type Region,
} from "../lib/constants";
import { fmtTWD, toTWD } from "../lib/finance";

type Op = "+" | "-" | "×" | "÷";

const apply = (a: number, op: Op, b: number): number => {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "×") return a * b;
  return b === 0 ? a : a / b;
};

/** 千分位,但保留正在輸入中的小數尾巴(如 "85." ) */
function displayEntry(entry: string): string {
  if (!entry) return "0";
  const [int, dec] = entry.split(".");
  const withSep = Number(int || "0").toLocaleString("zh-TW");
  return entry.includes(".") ? `${withSep}.${dec ?? ""}` : withSep;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const SPEC = {
  expense: { title: "記一筆花費", path: "/api/expenses", catField: "category", table: "expenses", verb: "已記錄" },
  asset: { title: "新增資產", path: "/api/assets", catField: "category", table: "assets", verb: "已新增資產" },
  income: { title: "新增收入", path: "/api/incomes", catField: "type", table: "incomes", verb: "已新增收入" },
} as const;

/**
 * 計算機式輸入面板,三種資料共用:金額 → 分類 → 完成。
 *
 * 差異只在中間那排 chips 與名稱欄位:
 * - 花費有日期,名稱可留空(帶入分類名),因為一天要記好幾筆
 * - 資產與收入的名稱是「台銀活存」「本薪」這種真正的識別,所以固定顯示
 * - 收入多一排頻率
 *
 * 地區決定幣別,不必再選一次。
 */
export default function QuickEntry({
  kind,
  onClose,
  onSaved,
}: {
  kind: CategoryKind;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const spec = SPEC[kind];
  const { rates, refresh, cats } = useStore();
  const options = cats.list(kind);
  const namedEntity = kind !== "expense";

  const [entry, setEntry] = useState("");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);

  const [category, setCategory] = useState(options[0]?.key ?? "");
  const [region, setRegion] = useState<Region>("TW");
  const [currency, setCurrency] = useState<Currency>("TWD");
  const [date, setDate] = useState(ymd(new Date()));
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [showDate, setShowDate] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const today = ymd(new Date());
  const yesterday = ymd(new Date(Date.now() - 86400000));

  // 只有兩個運算元都到齊才折算,避免「85000 ×」按下完成時被算成 0
  const total =
    op && acc !== null && entry !== ""
      ? apply(acc, op, Number(entry))
      : entry !== ""
        ? Number(entry)
        : (acc ?? 0);
  const shown = entry !== "" ? displayEntry(entry) : op ? "0" : displayEntry(String(acc ?? 0));

  const pickRegion = (r: Region) => {
    setRegion(r);
    setCurrency(REGION_CURRENCY[r]);
  };

  const digit = (d: string) => {
    setError("");
    if (d === "." && entry.includes(".")) return;
    if (d === "000" && entry === "") return;
    setEntry((prev) => (prev === "0" && d !== "." ? d : prev + d));
  };

  const operator = (next: Op) => {
    if (entry === "" && acc === null) return;
    if (acc !== null && op && entry !== "") setAcc(apply(acc, op, Number(entry)));
    else if (entry !== "") setAcc(Number(entry));
    setOp(next);
    setEntry("");
  };

  const backspace = () => {
    if (entry !== "") setEntry(entry.slice(0, -1));
    else if (op) setOp(null);
    else setAcc(null);
  };

  const save = async () => {
    if (!(total > 0)) {
      setError("請先輸入金額");
      return;
    }
    if (!category) {
      setError("請先選擇分類");
      return;
    }
    setBusy(true);
    setError("");
    const label = cats.label(kind, category);
    const body: Record<string, unknown> = {
      name: name.trim() || label,
      [spec.catField]: category,
      region,
      amount: total,
      currency,
      note: note.trim(),
    };
    if (kind === "expense") body.date = date;
    if (kind === "income") body.frequency = frequency;

    try {
      await post(spec.path, body);
      await refresh(spec.table);
      onSaved(`${spec.verb} ${currency} ${Math.round(total).toLocaleString("zh-TW")} · ${label}`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const keyBase =
    "rounded-mid border-2 border-ink font-round text-lg font-bold text-ink transition active:bg-p-butter";
  const chip = (on: boolean) =>
    `rounded-full border-2 px-3 py-1 text-xs transition ${
      on ? "border-ink bg-p-butter font-bold text-ink" : "border-line-soft text-ink-2 hover:border-ink"
    }`;
  const textInput = "w-full rounded-mid border-2 border-ink bg-card px-3 py-2 text-sm";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={spec.title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[94vh] w-full max-w-sm overflow-y-auto rounded-t-card border-2 border-ink bg-paper p-4 sm:rounded-card"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {/* 金額 */}
        <div className="flex items-start justify-between gap-3 px-1 pb-3">
          <div className="min-w-0">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              aria-label="幣別"
              className="-ml-1 rounded-full px-1 text-xs font-medium tracking-wider text-ink-3"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="tnum truncate font-round text-4xl font-bold leading-tight">{shown}</div>
            <div className="text-xs text-ink-3">
              {op && <span className="mr-2 text-mango-d">{acc?.toLocaleString("zh-TW")} {op}</span>}
              {currency !== "TWD" && <>≈ {fmtTWD(toTWD(total, currency, rates.rates))}</>}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="關閉"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-ink bg-card text-sm"
          >
            ✕
          </button>
        </div>

        {/* 分類。最後一格可以當場開新分類,不必先跑一趟分類管理 */}
        <div className="grid max-h-52 grid-cols-4 gap-2 overflow-y-auto pb-3">
          {options.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className="flex flex-col items-center gap-1"
              aria-pressed={category === c.key}
            >
              <Bubble tint={c.tint} active={category === c.key}>
                {c.icon}
              </Bubble>
              <span className={`text-[11px] leading-tight ${category === c.key ? "font-bold text-ink" : "text-ink-2"}`}>
                {c.label}
              </span>
            </button>
          ))}
          <button onClick={() => setAddingCategory(true)} className="flex flex-col items-center gap-1">
            <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-dashed border-ink-3 text-lg text-ink-3">
              ＋
            </span>
            <span className="text-[11px] leading-tight text-ink-3">新增分類</span>
          </button>
        </div>

        {/* 資產與收入的名稱是識別用的,固定顯示而不是收在「更多」後面 */}
        {namedEntity && (
          <input
            type="text"
            placeholder={kind === "asset" ? "資產名稱(例如:台銀活存)" : "收入名稱(例如:本薪)"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${textInput} mb-2`}
          />
        )}

        {/* 地區(決定幣別) */}
        <div className="flex flex-wrap gap-1.5 pb-2">
          {REGIONS.map((r) => (
            <button key={r} onClick={() => pickRegion(r)} className={chip(region === r)}>
              {REGION_FLAG[r]} {REGION_LABEL[r]}
            </button>
          ))}
        </div>

        {/* 花費的日期 / 收入的頻率 / 共用的備註 */}
        <div className="flex flex-wrap gap-1.5 pb-3">
          {kind === "expense" && (
            <>
              <button onClick={() => { setDate(today); setShowDate(false); }} className={chip(date === today && !showDate)}>
                今天
              </button>
              <button onClick={() => { setDate(yesterday); setShowDate(false); }} className={chip(date === yesterday && !showDate)}>
                昨天
              </button>
              <button onClick={() => setShowDate(true)} className={chip(showDate)}>
                選日期
              </button>
            </>
          )}
          {kind === "income" &&
            FREQUENCIES.map((f) => (
              <button key={f.value} onClick={() => setFrequency(f.value)} className={chip(frequency === f.value)}>
                {f.label}
              </button>
            ))}
          <button onClick={() => setShowMore((v) => !v)} className={chip(showMore)}>
            ＋備註
          </button>
        </div>

        {showDate && kind === "expense" && (
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`${textInput} mb-3`}
          />
        )}

        {showMore && (
          <div className="mb-3 space-y-2">
            {!namedEntity && (
              <input
                type="text"
                placeholder={`名稱(留空為「${cats.label(kind, category)}」)`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={textInput}
              />
            )}
            <input
              type="text"
              placeholder="備註"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={textInput}
            />
          </div>
        )}

        {error && <p className="pb-2 text-center text-sm text-danger">{error}</p>}

        {/* 鍵盤 */}
        <div className="grid grid-cols-4 gap-2">
          <button onClick={backspace} className={`${keyBase} bg-p-stone py-3`} aria-label="退格">⌫</button>
          <button onClick={() => operator("÷")} className={`${keyBase} bg-p-stone py-3`}>÷</button>
          <button onClick={() => operator("×")} className={`${keyBase} bg-p-stone py-3`}>×</button>
          <button onClick={() => operator("-")} className={`${keyBase} bg-p-stone py-3`}>−</button>

          <button onClick={() => digit("7")} className={`${keyBase} bg-card py-3`}>7</button>
          <button onClick={() => digit("8")} className={`${keyBase} bg-card py-3`}>8</button>
          <button onClick={() => digit("9")} className={`${keyBase} bg-card py-3`}>9</button>
          <button onClick={() => operator("+")} className={`${keyBase} row-span-2 bg-p-stone`}>＋</button>

          <button onClick={() => digit("4")} className={`${keyBase} bg-card py-3`}>4</button>
          <button onClick={() => digit("5")} className={`${keyBase} bg-card py-3`}>5</button>
          <button onClick={() => digit("6")} className={`${keyBase} bg-card py-3`}>6</button>

          <button onClick={() => digit("1")} className={`${keyBase} bg-card py-3`}>1</button>
          <button onClick={() => digit("2")} className={`${keyBase} bg-card py-3`}>2</button>
          <button onClick={() => digit("3")} className={`${keyBase} bg-card py-3`}>3</button>
          <button
            onClick={save}
            disabled={busy}
            className={`${keyBase} row-span-2 bg-mango text-base disabled:opacity-50`}
          >
            {busy ? "…" : "完成"}
          </button>

          <button onClick={() => digit("0")} className={`${keyBase} bg-card py-3`}>0</button>
          <button onClick={() => digit("000")} className={`${keyBase} bg-card py-3`}>000</button>
          <button onClick={() => digit(".")} className={`${keyBase} bg-card py-3`}>.</button>
        </div>
      </div>

      {addingCategory && (
        <CategoryManager
          initialKind={kind}
          autoAdd
          onCreated={(c) => setCategory(c.key)}
          onClose={() => setAddingCategory(false)}
        />
      )}
    </div>
  );
}
