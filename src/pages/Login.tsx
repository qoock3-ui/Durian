import { useState } from "react";
import { post } from "../api";
import { useStore } from "../store";
import Mascot from "../components/Mascot";
import { inputClass } from "../components/ui";
import type { User } from "../lib/constants";

export default function Login() {
  const { login } = useStore();
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = mode === "login" ? { email, password } : { email, name, password };
      const res = await post<{ token: string; user: User }>(`/api/auth/${mode}`, body);
      login(res.user, res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setForgotMessage("");
    try {
      await post("/api/auth/forgot-password", { email });
      setForgotMessage("若信箱存在,臨時密碼已寄出,請查看信箱(30 分鐘內有效)。");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const bigButton =
    "w-full rounded-full border-2 border-ink bg-mango py-2.5 font-round text-sm font-bold text-ink transition hover:bg-mango-d disabled:opacity-50";
  const linkButton =
    "mt-4 w-full text-center text-sm text-ink-2 underline-offset-2 hover:text-ink hover:underline";

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <div className="w-full max-w-sm rounded-card border-2 border-ink bg-card p-7">
        <div className="mb-5 flex flex-col items-center gap-2">
          <Mascot size={76} mood={mode === "forgot" ? "sleepy" : "happy"} />
          <h1 className="font-round text-2xl font-bold">FinTrack</h1>
          <p className="text-sm text-ink-3">跨國資產管理系統</p>
        </div>

        {mode === "forgot" ? (
          <>
            <form onSubmit={submitForgot} className="space-y-3">
              <input
                className={inputClass}
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {error && <p className="text-sm text-danger">{error}</p>}
              {forgotMessage && <p className="text-sm text-income">{forgotMessage}</p>}
              <button type="submit" disabled={busy} className={bigButton}>
                {busy ? "處理中…" : "寄送臨時密碼"}
              </button>
            </form>
            <button
              onClick={() => {
                setMode("login");
                setError("");
                setForgotMessage("");
              }}
              className={linkButton}
            >
              返回登入
            </button>
          </>
        ) : (
          <>
            <form onSubmit={submit} className="space-y-3">
              <input
                className={inputClass}
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {mode === "register" && (
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
              {mode === "login" && (
                <button
                  type="button"
                  onClick={() => {
                    setMode("forgot");
                    setError("");
                    setForgotMessage("");
                  }}
                  className="block w-full text-right text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline"
                >
                  忘記密碼?
                </button>
              )}
              {error && <p className="text-sm text-danger">{error}</p>}
              <button type="submit" disabled={busy} className={bigButton}>
                {busy ? "處理中…" : mode === "login" ? "登入" : "註冊"}
              </button>
            </form>
            <button
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
              className={linkButton}
            >
              {mode === "login" ? "還沒有帳號?註冊" : "已有帳號?登入"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
