import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useStore } from "../store";
import ChangePasswordModal from "./ChangePasswordModal";

const NAV = [
  { to: "/", label: "總覽", icon: "📊" },
  { to: "/assets", label: "資產", icon: "💰" },
  { to: "/incomes", label: "收入", icon: "💵" },
  { to: "/expenses", label: "花費", icon: "🧾" },
  { to: "/trends", label: "趨勢", icon: "📈" },
];

export default function Layout() {
  const { user, logout } = useStore();
  const initial = user?.name?.[0]?.toUpperCase() ?? "?";
  const [showChangePassword, setShowChangePassword] = useState(false);

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar (md and up) */}
      <aside className="hidden w-56 shrink-0 bg-sidebar text-slate-300 md:flex md:flex-col">
        <div className="px-5 py-6 text-xl font-bold text-white">
          💎 FinTrack
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? "bg-sidebar-active text-white" : "hover:bg-white/10"
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-active text-sm font-bold text-white">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{user?.name}</div>
              <div className="truncate text-xs text-slate-400">{user?.email}</div>
            </div>
          </div>
          <button
            onClick={() => setShowChangePassword(true)}
            className="mt-3 w-full rounded-lg bg-white/10 py-1.5 text-xs hover:bg-white/20"
          >
            修改密碼
          </button>
          <button
            onClick={logout}
            className="mt-2 w-full rounded-lg bg-white/10 py-1.5 text-xs hover:bg-white/20"
          >
            登出
          </button>
        </div>
      </aside>

      {/* Mobile top bar (below md) */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-sidebar px-4 py-2.5 text-white md:hidden">
        <span className="text-lg font-bold">💎 FinTrack</span>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-active text-xs font-bold">
            {initial}
          </div>
          <button
            onClick={() => setShowChangePassword(true)}
            className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs hover:bg-white/20"
          >
            修改密碼
          </button>
          <button
            onClick={logout}
            className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs hover:bg-white/20"
          >
            登出
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-x-hidden p-4 pb-24 md:p-6 md:pb-6 lg:p-8">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar (below md) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-white/10 bg-sidebar md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition ${
                isActive ? "text-white" : "text-slate-400"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`flex h-7 w-9 items-center justify-center rounded-full text-base transition ${
                    isActive ? "bg-sidebar-active" : ""
                  }`}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}
