import { useEffect, useState, type ReactNode } from "react";
import { GhostButton, ModalShell, PrimaryButton, inputClass } from "./ui";

export type Field = {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "textarea";
  required?: boolean;
  options?: { value: string; label: string }[];
  /** 分組下拉(資產類別用) */
  groups?: { group: string; items: { value: string; label: string }[] }[];
  /** 給選單一個「就地新增選項」的入口,例如新增分類 */
  onAdd?: () => void;
  addLabel?: string;
};

export default function FormModal({
  title,
  fields,
  initial,
  patch,
  onSubmit,
  onClose,
}: {
  title: string;
  fields: Field[];
  initial: Record<string, string | number | null | undefined>;
  /** 外部塞值進來(例如就地新增分類後自動選起來),不重置其他已填欄位 */
  patch?: Record<string, string>;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, String(initial[f.name] ?? "")])),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (patch) setValues((prev) => ({ ...prev, ...patch }));
  }, [patch]);

  const set = (name: string, v: string) => setValues((prev) => ({ ...prev, [name]: v }));

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const out: Record<string, unknown> = {};
      for (const f of fields) {
        const raw = values[f.name];
        out[f.name] = f.type === "number" ? Number(raw) : raw;
      }
      await onSubmit(out);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const renderField = (f: Field): ReactNode => {
    if (f.type === "select") {
      return (
        <select className={inputClass} value={values[f.name]} onChange={(e) => set(f.name, e.target.value)}>
          <option value="">請選擇</option>
          {f.groups
            ? f.groups.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </optgroup>
              ))
            : f.options?.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
        </select>
      );
    }
    if (f.type === "textarea") {
      return <textarea className={inputClass} rows={2} value={values[f.name]} onChange={(e) => set(f.name, e.target.value)} />;
    }
    return (
      <input
        className={inputClass}
        type={f.type}
        step={f.type === "number" ? "any" : undefined}
        value={values[f.name]}
        onChange={(e) => set(f.name, e.target.value)}
      />
    );
  };

  return (
    <ModalShell title={title} onClose={onClose}>
      <div className="space-y-3">
        {fields.map((f) => (
          <label key={f.name} className="block">
            <span className="mb-1 flex items-baseline justify-between gap-2 text-sm font-medium text-ink-2">
              <span>
                {f.label}
                {f.required && <span className="text-danger"> *</span>}
              </span>
              {f.onAdd && (
                <button
                  type="button"
                  onClick={f.onAdd}
                  className="text-xs text-mango-d underline-offset-2 hover:underline"
                >
                  {f.addLabel ?? "＋ 新增選項"}
                </button>
              )}
            </span>
            {renderField(f)}
          </label>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <GhostButton onClick={onClose}>取消</GhostButton>
        <PrimaryButton onClick={submit} disabled={busy}>
          {busy ? "儲存中…" : "儲存"}
        </PrimaryButton>
      </div>
    </ModalShell>
  );
}
