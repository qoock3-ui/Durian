import { useState } from "react";
import { post } from "../api";
import { GhostButton, ModalShell, PrimaryButton, inputClass } from "./ui";
import Mascot from "./Mascot";

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  // 打錯一個字就再也登不進來,所以在送出前先比對兩次輸入
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("兩次輸入的新密碼不一致");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await post("/api/auth/change-password", { currentPassword, newPassword });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="修改密碼" onClose={onClose}>
      {done ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <Mascot size={64} mood="cheer" />
          <p className="text-sm text-ink-2">密碼已更新。</p>
          <PrimaryButton onClick={onClose}>關閉</PrimaryButton>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-2">目前密碼</span>
            <input
              className={inputClass}
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-2">新密碼(至少 8 碼)</span>
            <input
              className={inputClass}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-2">再輸入一次新密碼</span>
            <input
              className={`${inputClass} ${mismatch ? "border-danger" : ""}`}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
            {mismatch && <span className="mt-1 block text-xs text-danger">兩次輸入不一致</span>}
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <GhostButton onClick={onClose}>取消</GhostButton>
            <PrimaryButton type="submit" disabled={busy || mismatch}>
              {busy ? "處理中…" : "確認修改"}
            </PrimaryButton>
          </div>
        </form>
      )}
    </ModalShell>
  );
}
