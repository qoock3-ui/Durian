import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { post } from "../api";
import { useStore } from "../store";
import ChangePasswordModal from "./ChangePasswordModal";
import CategoryManager from "./CategoryManager";
import QuickAdd from "./QuickAdd";
import FormModal from "./FormModal";
import Mascot from "./Mascot";
import { assetFields, incomeFields } from "./entityForms";

const NAV = [
  { to: "/", label: "總覽", icon: "🏠" },
  { to: "/assets", label: "資產", icon: "💰" },
  { to: "/incomes", label: "收入", icon: "💵" },
  { to: "/expenses", label: "花費", icon: "🧾" },
  { to: "/trends", label: "趨勢", icon: "📈" },
];

/** 浮動按鈕在哪一頁就新增哪一種東西,而不是一律開支出面板 */
function addTargetFor(pathname: string): "asset" | "income" | "expense" {
  if (pathname.startsWith("/assets")) return "asset";
  if (pathname.startsWith("/incomes")) return "income";
  return "expense";
}

const TARGET_LABEL = { asset: "新增資產", income: "新增收入", expense: "記一筆" } as const;

function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 md:bottom-8"
    >
      <div className="flex items-center gap-2 rounded-full border-2 border-ink bg-p-mint px-4 py-2 text-sm font-medium">
        <Mascot size={24} mood="cheer" />
        {text}
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout, refresh, cats } = useStore();
  const { pathname } = useLocation();
  const initial = user?.name?.[0]?.toUpperCase() ?? "?";
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [adding, setAdding] = useState<"asset" | "income" | "expense" | null>(null);
  const [toast, setToast] = useState("");

  const target = addTargetFor(pathname);

  const saveEntity = async (values: Record<string, unknown>) => {
    if (adding === "asset") {
      await post("/api/assets", values);
      await refresh("assets");
      setToast("已新增資產");
    } else if (adding === "income") {
      await post("/api/incomes", values);
      await refresh("incomes");
      setToast("已新增收入");
    }
  };

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-full border-2 px-3 py-2 text-sm font-medium transition ${
      isActive ? "border-ink bg-p-butter text-ink" : "border-transparent text-ink-2 hover:border-ink hover:text-ink"
    }`;

  const smallButton =
    "w-full rounded-full border-2 border-line-soft py-1.5 text-xs text-ink-2 transition hover:border-ink hover:text-ink";

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
          <button
            onClick={() => setAdding(target)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-mango px-3 py-2 font-round text-sm font-bold transition hover:bg-mango-d"
          >
            ＋ {TARGET_LABEL[target]}
          </button>
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
          <button
            onClick={() => setShowCategories(true)}
            className="rounded-full border-2 border-line-soft px-2.5 py-1 text-xs text-ink-2"
          >
            分類
          </button>
          <button
            onClick={() => setShowChangePassword(true)}
            className="rounded-full border-2 border-line-soft px-2.5 py-1 text-xs text-ink-2"
          >
            密碼
          </button>
          <button
            onClick={logout}
            className="rounded-full border-2 border-line-soft px-2.5 py-1 text-xs text-ink-2"
          >
            登出
          </button>
        </div>
      </header>

      {/* pb 需同時清開底部分頁與其上方的浮動按鈕 */}
      <main className="flex-1 overflow-x-hidden p-4 pb-40 md:p-6 md:pb-6 lg:p-8">
        <Outlet />
      </main>

      {/* 手機浮動新增鈕:依目前頁面決定新增什麼 */}
      <button
        onClick={() => setAdding(target)}
        aria-label={TARGET_LABEL[target]}
        className="fixed right-4 z-30 grid h-14 w-14 place-items-center rounded-full border-2 border-ink bg-mango font-round text-2xl font-bold text-ink transition active:bg-mango-d md:hidden"
        style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
      >
        ＋
      </button>

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

      {adding === "expense" && <QuickAdd onClose={() => setAdding(null)} onSaved={setToast} />}
      {adding === "asset" && (
        <FormModal
          title="新增資產"
          fields={assetFields(cats)}
          initial={{ currency: "TWD", region: "TW", category: cats.list("asset")[0]?.key ?? "" }}
          onSubmit={saveEntity}
          onClose={() => setAdding(null)}
        />
      )}
      {adding === "income" && (
        <FormModal
          title="新增收入"
          fields={incomeFields(cats)}
          initial={{
            currency: "TWD",
            region: "TW",
            frequency: "monthly",
            type: cats.list("income")[0]?.key ?? "",
          }}
          onSubmit={saveEntity}
          onClose={() => setAdding(null)}
        />
      )}
      {toast && <Toast text={toast} onDone={() => setToast("")} />}
      {showCategories && <CategoryManager onClose={() => setShowCategories(false)} />}
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}
