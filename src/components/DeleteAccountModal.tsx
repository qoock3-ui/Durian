import { useState } from "react";
import { ApiError, del, get } from "../api";
import { GhostButton, ModalShell, PrimaryButton, inputClass } from "./ui";

type Lookup = {
  email: string;
  name: string;
  createdAt: string;
  isAdmin: boolean;
  counts: { assets: number; incomes: number; expenses: number; invoices: number };
};

/**
 * 管理者專用:刪除一個帳號與它的全部資料。
 *
 * 兩步驟——先查再刪,不是輸入 Email 就直接送刪除請求。查詢會列出這個帳號
 * 有多少筆資產、收入、花費、發票,管理者親眼看過內容再按刪除,才不會手滑
 * 刪錯人,或以為只是一個空帳號結果裡面有資料。
 */
export default function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setLookup(null);
    try {
      setLookup(await get<Lookup>(`/api/auth/admin/lookup-user?email=${encodeURIComponent(email.trim())}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!lookup) return;
    if (!confirm(`確定永久刪除「${lookup.email}」？這會連同它的所有資料一起刪掉，無法復原。`)) return;
    setBusy(true);
    setError("");
    try {
      await del(`/api/auth/admin/users/${encodeURIComponent(lookup.email)}`);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const total = lookup
    ? lookup.counts.assets + lookup.counts.incomes + lookup.counts.expenses + lookup.counts.invoices
    : 0;

  return (
    <ModalShell title="刪除帳號" onClose={onClose}>
      {done ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">
            <b className="text-ink">{lookup?.email}</b> 已經刪除。
          </p>
          <PrimaryButton onClick={onClose} className="w-full">
            完成
          </PrimaryButton>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">輸入要刪除的帳號 Email，看過裡面有什麼再決定要不要刪。</p>
          <form onSubmit={search} className="flex gap-2">
            <input
              className={inputClass}
              type="email"
              placeholder="要刪除的 Email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setLookup(null);
              }}
              required
            />
            <PrimaryButton type="submit" className="shrink-0" disabled={busy}>
              {busy && !lookup ? "查詢中…" : "查詢"}
            </PrimaryButton>
          </form>

          {lookup && (
            <div className="rounded-mid border-2 border-line-soft p-3 text-sm">
              <p>
                <b>{lookup.name}</b>（{lookup.email}）
              </p>
              <p className="mt-1 text-xs text-ink-3">
                註冊於 {new Date(lookup.createdAt + "Z").toLocaleDateString("zh-TW")}
              </p>
              {lookup.isAdmin ? (
                <p className="mt-2 text-xs text-danger">這是目前的管理者帳號，不能刪除。</p>
              ) : total === 0 ? (
                <p className="mt-2 text-xs text-ink-2">沒有任何資料的空帳號。</p>
              ) : (
                <p className="mt-2 text-xs text-ink-2">
                  資產 {lookup.counts.assets} · 收入 {lookup.counts.incomes} · 花費 {lookup.counts.expenses} · 發票{" "}
                  {lookup.counts.invoices}，共 {total} 筆資料
                </p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <GhostButton onClick={onClose}>取消</GhostButton>
            <button
              type="button"
              onClick={remove}
              disabled={!lookup || lookup.isAdmin || busy}
              className="rounded-full border-2 border-danger bg-p-rose px-4 py-2 font-round text-sm font-bold text-ink transition hover:bg-danger hover:text-paper disabled:opacity-50"
            >
              {busy && lookup ? "刪除中…" : "永久刪除"}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
