import { NavLink, Outlet } from "react-router-dom";
import { useStore } from "../store";

const NAV = [
  { to: "/", label: "總覽", icon: "📊" },
  { to: "/assets", label: "資產", icon: "💰" },
  { to: "/incomes", label: "收入", icon: "💵" },
  { to: "/expenses", label: "花費", icon: "🧾" },
  { to: "/trends", label: "趨勢", icon: "📈" },
];

export default function Layout() {
  const { user, logout } = useStore();
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 bg-sidebar text-slate-300 flex flex-col">
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
              {user?.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{user?.name}</div>
              <div className="truncate text-xs text-slate-400">{user?.email}</div>
            </div>
          </div>
          <button
            onClick={logout}
            className="mt-3 w-full rounded-lg bg-white/10 py-1.5 text-xs hover:bg-white/20"
          >
            登出
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
