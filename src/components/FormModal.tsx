import { useState, type ReactNode } from "react";

export type Field = {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "textarea";
  required?: boolean;
  options?: { value: string; label: string }[];
  /** 分組下拉(資產類別用) */
  groups?: { group: string; items: { value: string; label: string }[] }[];
};

export default function FormModal({
  title,
  fields,
  initial,
  onSubmit,
  onClose,
}: {
  title: string;
  fields: Field[];
  initial: Record<string, string | number | null | undefined>;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, String(initial[f.name] ?? "")])),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-semibold">{title}</h3>
        <div className="space-y-3">
          {fields.map((f) => (
            <label key={f.name} className="block">
              <span className="mb-1 block text-sm font-medium text-slate-600">
                {f.label}
                {f.required && <span className="text-red-500"> *</span>}
              </span>
              {renderField(f)}
            </label>
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
            取消
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "儲存中…" : "儲存"}
          </button>
        </div>
      </div>
    </div>
  );
}
