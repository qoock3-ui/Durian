import type { ReactNode } from "react";
import type { Region } from "../lib/constants";
import { REGION_COLOR, REGION_FLAG, REGION_LABEL } from "../lib/constants";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-4 text-base font-semibold text-slate-700">{children}</h2>;
}

export function PrimaryButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700"
    >
      {children}
    </button>
  );
}

export function RegionBadge({ region }: { region: Region }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${REGION_COLOR[region]}`}>
      {REGION_FLAG[region]} {REGION_LABEL[region]}
    </span>
  );
}

export function Badge({ children, className = "bg-slate-100 text-slate-600" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
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
    <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
      {regions.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`rounded-md px-3 py-1 text-sm ${
            value === r ? "bg-white font-medium text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
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
    <div className="flex gap-1">
      <button onClick={onEdit} title="編輯" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600">
        ✏️
      </button>
      <button onClick={onDelete} title="刪除" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600">
        🗑️
      </button>
    </div>
  );
}

export function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-slate-400">
      <div className="text-5xl">🗂️</div>
      <p className="text-sm">{text}</p>
      {action}
    </div>
  );
}
