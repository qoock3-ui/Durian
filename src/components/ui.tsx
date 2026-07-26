import { useEffect, type ReactNode } from "react";
import type { Region } from "../lib/constants";
import { REGION_COLOR, REGION_FLAG, REGION_LABEL } from "../lib/constants";
import Mascot from "./Mascot";

/**
 * Daak × Money+ 語彙的基礎元件。
 * 核心規則:零陰影、2px ink 描邊、圖示一律進圓形氣泡、橘色只給可按的東西。
 */

export function Card({
  children,
  className = "",
  tint = "bg-card",
}: {
  children: ReactNode;
  className?: string;
  /** 粉彩底色,如 bg-p-lilac;預設白卡 */
  tint?: string;
}) {
  return (
    <div className={`rounded-card border-2 border-ink p-5 md:p-5 ${tint} ${className}`}>{children}</div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-4 font-round text-lg font-bold md:text-base">{children}</h2>;
}

/** 圓形氣泡圖示 — 全站分類/地區/群組共用 */
export function Bubble({
  children,
  tint = "bg-p-stone",
  size = "md",
  active = false,
}: {
  children: ReactNode;
  tint?: string;
  size?: "sm" | "md" | "lg";
  active?: boolean;
}) {
  const dim = size === "sm" ? "h-8 w-8 text-sm" : size === "lg" ? "h-14 w-14 text-2xl" : "h-11 w-11 text-lg";
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full border-2 ${
        active ? "border-mango-d ring-2 ring-mango-d" : "border-ink"
      } ${dim} ${tint}`}
    >
      {children}
    </span>
  );
}

export function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border-2 border-ink bg-mango px-4 py-2 font-round text-sm font-bold text-ink transition hover:bg-mango-d disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border-2 border-line-soft px-4 py-2 text-sm font-medium text-ink-2 transition hover:border-ink hover:text-ink ${className}`}
    >
      {children}
    </button>
  );
}

/** 手機只顯示國旗以省寬度,sm 以上才帶文字 */
export function RegionBadge({ region }: { region: Region }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-ink px-1.5 py-0.5 text-xs font-medium sm:px-2 ${REGION_COLOR[region]}`}
    >
      {REGION_FLAG[region]}
      <span className="hidden sm:inline">{REGION_LABEL[region]}</span>
    </span>
  );
}

export function Badge({ children, className = "bg-p-stone" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 whitespace-nowrap rounded-full border-2 border-ink px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

/** 地區篩選 tab(純前端篩選) */
export function RegionTabs({
  regions,
  value,
  onChange,
}: {
  regions: readonly (Region | "ALL")[];
  value: Region | "ALL";
  onChange: (r: Region | "ALL") => void;
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {regions.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`shrink-0 whitespace-nowrap rounded-full border-2 px-3 py-1 text-sm transition ${
            value === r
              ? "border-ink bg-p-butter font-bold text-ink"
              : "border-line-soft text-ink-2 hover:border-ink hover:text-ink"
          }`}
        >
          {r === "ALL" ? "全部" : `${REGION_FLAG[r]} ${REGION_LABEL[r]}`}
        </button>
      ))}
    </div>
  );
}

export function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex shrink-0 gap-0.5 sm:gap-1">
      <button
        onClick={onEdit}
        title="編輯"
        aria-label="編輯"
        className="grid h-7 w-7 place-items-center rounded-full text-xs text-ink-3 transition hover:bg-p-sky hover:text-ink sm:h-8 sm:w-8 sm:text-sm"
      >
        ✏️
      </button>
      <button
        onClick={onDelete}
        title="刪除"
        aria-label="刪除"
        className="grid h-7 w-7 place-items-center rounded-full text-xs text-ink-3 transition hover:bg-p-rose hover:text-ink sm:h-8 sm:w-8 sm:text-sm"
      >
        🗑️
      </button>
    </div>
  );
}

export function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-ink-3">
      <Mascot size={72} mood="sleepy" />
      <p className="text-sm">{text}</p>
      {action}
    </div>
  );
}

/** 存檔回饋。自動消失,不擋操作。 */
export function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 md:bottom-8"
    >
      <div className="flex items-center gap-2 rounded-full border-2 border-ink bg-p-mint px-4 py-2 text-sm font-medium">
        <Mascot size={24} mood="cheer" />
        {text}
      </div>
    </div>
  );
}

export const inputClass =
  "w-full rounded-mid border-2 border-ink bg-card px-3 py-2 text-sm placeholder:text-ink-3 focus:border-mango-d focus:outline-none";

/** 彈窗外殼:手機貼底、桌面置中 */
export function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-card border-2 border-ink bg-paper p-5 sm:rounded-card"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-round text-lg font-bold">{title}</h3>
          <button
            onClick={onClose}
            aria-label="關閉"
            className="grid h-8 w-8 place-items-center rounded-full border-2 border-ink bg-card text-sm"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** 月份左右導覽 */
export function MonthNav({ label, onPrev, onNext }: { label: string; onPrev: () => void; onNext: () => void }) {
  const btn =
    "grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-ink bg-card text-sm transition hover:bg-p-butter";
  return (
    <div className="flex items-center justify-center gap-4">
      <button onClick={onPrev} className={btn} aria-label="上個月">
        ‹
      </button>
      <span className="font-round text-base font-bold">{label}</span>
      <button onClick={onNext} className={btn} aria-label="下個月">
        ›
      </button>
    </div>
  );
}
