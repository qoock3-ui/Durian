import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useStore } from "../store";
import ChangePasswordModal from "./ChangePasswordModal";
import CategoryManager from "./CategoryManager";
import TempPasswordModal from "./TempPasswordModal";
import DeleteAccountModal from "./DeleteAccountModal";
import InstallPrompt from "./InstallPrompt";
import Mascot from "./Mascot";

const NAV = [
  { to: "/", label: "總覽", icon: "🏠" },
  { to: "/assets", label: "資產", icon: "💰" },
  { to: "/incomes", label: "收入", icon: "💵" },
  { to: "/expenses", label: "花費", icon: "🧾" },
  { to: "/invoices", label: "發票", icon: "🎟️" },
  { to: "/trends", label: "趨勢", icon: "📈" },
];

export default function Layout() {
  const { user, logout } = useStore();
  const initial = user?.name?.[0]?.toUpperCase() ?? "?";
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showTempPassword, setShowTempPassword] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-full border-2 px-3 py-2 text-sm font-medium transition ${
      isActive ? "border-ink bg-p-butter text-ink" : "border-transparent text-ink-2 hover:border-ink hover:text-ink"
    }`;

  const smallButton =
    "w-full rounded-full border-2 border-line-soft py-1.5 text-xs text-ink-2 transition hover:border-ink hover:text-ink";
  const chipButton = "rounded-full border-2 border-line-soft px-2.5 py-1 text-xs text-ink-2";

  return (
    <div className="min-h-screen md:flex">
      {/* 桌面側欄 */}
      <aside className="hidden w-60 shrink-0 flex-col border-r-2 border-ink bg-card md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <Mascot size={36} />
          <span className="font-round text-xl font-bold">FinTrack</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} className={navClass}>
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t-2 border-ink p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-p-lilac font-round text-sm font-bold">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user?.name}</div>
              <div className="truncate text-xs text-ink-3">{user?.email}</div>
            </div>
          </div>
          <button onClick={() => setShowCategories(true)} className={`mt-3 ${smallButton}`}>
            分類管理
          </button>
          <button onClick={() => setShowChangePassword(true)} className={`mt-2 ${smallButton}`}>
            修改密碼
          </button>
          {user?.is_admin && (
            <>
              <button onClick={() => setShowTempPassword(true)} className={`mt-2 ${smallButton}`}>
                核發臨時密碼
              </button>
              <button onClick={() => setShowDeleteAccount(true)} className={`mt-2 ${smallButton}`}>
                刪除帳號
              </button>
            </>
          )}
          <button onClick={logout} className={`mt-2 ${smallButton}`}>
            登出
          </button>
        </div>
      </aside>

      {/* 手機頂列 */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b-2 border-ink bg-card px-4 py-2 md:hidden">
        <div className="flex items-center gap-2">
          <Mascot size={28} />
          <span className="font-round text-lg font-bold">FinTrack</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowCategories(true)} className={chipButton}>
            分類
          </button>
          <button onClick={() => setShowChangePassword(true)} className={chipButton}>
            密碼
          </button>
          {user?.is_admin && (
            <>
              <button onClick={() => setShowTempPassword(true)} className={chipButton}>
                核發
              </button>
              <button onClick={() => setShowDeleteAccount(true)} className={chipButton}>
                刪除
              </button>
            </>
          )}
          <button onClick={logout} className={chipButton}>
            登出
          </button>
        </div>
      </header>

      {/* 沒有浮動按鈕了,pb 只需清開底部分頁 */}
      <main className="flex-1 overflow-x-hidden p-4 pb-24 md:p-6 md:pb-6 lg:p-8">
        <Outlet />
      </main>

      {/* 手機底部分頁 */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex border-t-2 border-ink bg-card md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] transition ${
                isActive ? "font-bold text-ink" : "text-ink-3"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`grid h-7 w-9 place-items-center rounded-full text-base ${
                    isActive ? "border-2 border-ink bg-p-butter" : ""
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

      {/* 還沒安裝才會冒出來,而且進來幾秒後才顯示,不跟首屏搶注意力 */}
      <InstallPrompt />

      {showCategories && <CategoryManager onClose={() => setShowCategories(false)} />}
      {showTempPassword && <TempPasswordModal onClose={() => setShowTempPassword(false)} />}
      {showDeleteAccount && <DeleteAccountModal onClose={() => setShowDeleteAccount(false)} />}
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}
