import { useState } from "react";
import { post } from "../api";
import { useStore } from "../store";
import Mascot from "../components/Mascot";
import { inputClass } from "../components/ui";
import type { User } from "../lib/constants";

/**
 * 「忘記密碼」暫不開放。後端 /api/auth/forgot-password 仍在,
 * 但它是把臨時密碼寄出去的,而寄件網域還沒完成驗證,信根本送不到
 * Gmail/Yahoo/Outlook。留一個按下去必定失敗的入口比沒有更糟,
 * 所以先收起來,需要時由管理者另行核發臨時密碼。
 */
export default function Login() {
  const { login } = useStore();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";
  // 註冊時打錯密碼會直接鎖在門外(目前沒有自助重設),所以要求輸入兩次
  const mismatch = isRegister && confirm.length > 0 && password !== confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegister && password !== confirm) {
      setError("兩次輸入的密碼不一致");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = isRegister ? { email, name, password } : { email, password };
      const res = await post<{ token: string; user: User }>(`/api/auth/${mode}`, body);
      login(res.user, res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const bigButton =
    "w-full rounded-full border-2 border-ink bg-mango py-2.5 font-round text-sm font-bold text-ink transition hover:bg-mango-d disabled:opacity-50";

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <div className="w-full max-w-sm rounded-card border-2 border-ink bg-card p-7">
        <div className="mb-5 flex flex-col items-center gap-2">
          <Mascot size={76} />
          <h1 className="font-round text-2xl font-bold">FinTrack</h1>
          <p className="text-sm text-ink-3">跨國資產管理系統</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            className={inputClass}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {isRegister && (
            <input
              className={inputClass}
              type="text"
              placeholder="顯示名稱"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
          <input
            className={inputClass}
            type="password"
            placeholder="密碼(至少 8 碼)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          {isRegister && (
            <div>
              <input
                className={`${inputClass} ${mismatch ? "border-danger" : ""}`}
                type="password"
                placeholder="再輸入一次密碼"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
              />
              {mismatch && <span className="mt-1 block text-xs text-danger">兩次輸入不一致</span>}
            </div>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={busy || mismatch} className={bigButton}>
            {busy ? "處理中…" : isRegister ? "註冊" : "登入"}
          </button>
        </form>

        {isRegister && (
          <p className="mt-3 text-center text-xs text-ink-3">
            請記牢密碼,目前尚未開放自助重設。
          </p>
        )}

        <button
          onClick={() => {
            setMode(isRegister ? "login" : "register");
            setConfirm("");
            setError("");
          }}
          className="mt-4 w-full text-center text-sm text-ink-2 underline-offset-2 hover:text-ink hover:underline"
        >
          {isRegister ? "已有帳號?登入" : "還沒有帳號?註冊"}
        </button>
      </div>
    </div>
  );
}
