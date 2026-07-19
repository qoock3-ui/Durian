import { useState } from "react";
import { post } from "../api";
import { useStore } from "../store";
import type { User } from "../lib/constants";

export default function Login() {
  const { login } = useStore();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-center text-2xl font-bold text-slate-800">💎 FinTrack</h1>
        <p className="mb-6 text-center text-sm text-slate-500">跨國資產管理系統</p>
        <form onSubmit={submit} className="space-y-3">
          <input className={inputClass} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {mode === "register" && (
            <input className={inputClass} type="text" placeholder="顯示名稱" value={name} onChange={(e) => setName(e.target.value)} required />
          )}
          <input className={inputClass} type="password" placeholder="密碼(至少 8 碼)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "處理中…" : mode === "login" ? "登入" : "註冊"}
          </button>
        </form>
        <button
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="mt-4 w-full text-center text-sm text-blue-600 hover:underline"
        >
          {mode === "login" ? "還沒有帳號?註冊" : "已有帳號?登入"}
        </button>
      </div>
    </div>
  );
}
