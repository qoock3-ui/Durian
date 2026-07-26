import { useState } from "react";
import { post } from "../api";
import { GhostButton, ModalShell, PrimaryButton, inputClass } from "./ui";

type Issued = { email: string; name: string; tempPassword: string; expiresAt: string };

/**
 * 管理者專用:替被鎖在門外的人核發臨時密碼。
 *
 * 寄件網域還沒驗證,信寄不出去,所以明文直接顯示在這裡,
 * 由管理者透過其他管道轉交。等網域備妥就可以改回自助重設。
 */
export default function TempPasswordModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [issued, setIssued] = useState<Issued | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setIssued(await post<Issued>("/api/auth/admin/temp-password", { email }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("瀏覽器不允許複製,請手動選取");
    }
  };

  return (
    <ModalShell title="核發臨時密碼" onClose={onClose}>
      {issued ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">
            已為 <b className="text-ink">{issued.name}</b>（{issued.email}）產生臨時密碼：
          </p>

          <div className="rounded-mid border-2 border-ink bg-p-butter p-4 text-center">
            <code className="select-all font-round text-xl font-bold tracking-wider">
              {issued.tempPassword}
            </code>
          </div>

          <PrimaryButton onClick={copy} className="w-full">
            {copied ? "已複製" : "複製密碼"}
          </PrimaryButton>

          <div className="rounded-mid border-2 border-line-soft p-3 text-xs leading-relaxed text-ink-2">
            <p className="mb-1 font-bold text-ink">請告訴對方：</p>
            <p>
              1. 這組密碼 <b>30 分鐘內</b>有效（{new Date(issued.expiresAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })} 到期）
              <br />
              2. 用它登入後，立刻到右上角「密碼」設定新密碼
              <br />
              3. 設定完成後這組臨時密碼就會失效
            </p>
          </div>

          <p className="text-xs text-danger">
            這組密碼只會顯示這一次，關掉視窗就看不到了。
          </p>

          <div className="flex justify-end gap-2">
            <GhostButton
              onClick={() => {
                setIssued(null);
                setEmail("");
              }}
            >
              再核發一組
            </GhostButton>
            <PrimaryButton onClick={onClose}>完成</PrimaryButton>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-ink-2">
            輸入對方註冊時用的 Email，系統會產生一組 30 分鐘內有效的臨時密碼。
          </p>
          <input
            className={inputClass}
            type="email"
            placeholder="對方的 Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <GhostButton onClick={onClose}>取消</GhostButton>
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? "產生中…" : "產生臨時密碼"}
            </PrimaryButton>
          </div>
        </form>
      )}
    </ModalShell>
  );
}
