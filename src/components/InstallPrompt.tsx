import { useEffect, useState } from "react";
import Mascot from "./Mascot";
import { installRoute, isInstalled, promptInstall, subscribe, type InstallRoute } from "../lib/install";

/**
 * 「要不要把 FinTrack 裝到桌面?」
 *
 * 手機與桌機都適用——Chrome 與 Edge 在 Windows、macOS、Linux 上都能把 PWA
 * 裝成獨立視窗,不是只有手機才行。
 *
 * 幾個刻意的分寸:
 * - 已經是安裝後開的視窗就整個不顯示。
 * - 按「不用了」記 30 天,不要每次進來都煩人。裝好了就永遠不再問。
 * - 進來先等一下再冒出來,不要跟首屏搶注意力。
 * - Safari 給不了安裝 API,只能教步驟;Firefox 桌機版根本不支援,那就不提,
 *   叫人按一個按不出東西的按鈕比不提還糟。
 */

const DISMISS_KEY = "fintrack_install_dismissed";
const QUIET_DAYS = 30;
const DELAY_MS = 4000;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    if (!at) return false;
    return Date.now() - at < QUIET_DAYS * 24 * 3600 * 1000;
  } catch {
    return false;
  }
}

const HOWTO: Record<Exclude<InstallRoute, "prompt" | null>, { title: string; steps: string[] }> = {
  ios: {
    title: "iPhone、iPad 要手動加一下",
    steps: [
      "點畫面下方(或右上角)的「分享」按鈕",
      "往下捲,選「加入主畫面」",
      "右上角按「新增」",
    ],
  },
  "mac-safari": {
    title: "Mac 上的 Safari 要手動加一下",
    steps: ["點網址列右邊的「分享」按鈕", "選「加入程式塢」", "按「新增」"],
  },
};

export default function InstallPrompt() {
  const [route, setRoute] = useState<InstallRoute>(null);
  const [visible, setVisible] = useState(false);
  const [howto, setHowto] = useState(false);

  useEffect(() => {
    if (isInstalled() || dismissedRecently()) return;

    const check = () => setRoute(installRoute());
    check();
    // beforeinstallprompt 可能比這個元件晚到,要能補上
    const unsubscribe = subscribe(check);
    const timer = window.setTimeout(() => setVisible(true), DELAY_MS);
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  if (!visible || !route) return null;

  const close = (remember: boolean) => {
    if (remember) {
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {
        // 無痕模式記不住就算了,大不了下次再問一次
      }
    }
    setVisible(false);
  };

  const install = async () => {
    if (route === "prompt") {
      const accepted = await promptInstall();
      // 沒裝就先收起來,但不記進 localStorage——他只是這次不想
      close(!accepted ? false : true);
      return;
    }
    setHowto(true);
  };

  const guide = route === "prompt" ? null : HOWTO[route];

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 md:bottom-6">
      <div className="pointer-events-auto w-full max-w-sm rounded-card border-2 border-ink bg-card p-4 shadow-[4px_4px_0_0_var(--color-ink)]">
        {howto && guide ? (
          <>
            <p className="font-round text-sm font-bold">{guide.title}</p>
            <ol className="mt-2 space-y-1 text-xs text-ink-2">
              {guide.steps.map((s, i) => (
                <li key={s} className="flex gap-2">
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 border-ink text-[9px]">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
            <button
              onClick={() => close(true)}
              className="mt-3 w-full rounded-full border-2 border-ink bg-mango py-1.5 font-round text-sm font-bold"
            >
              知道了
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Mascot size={40} mood="cheer" />
              <div className="min-w-0 flex-1">
                <p className="font-round text-sm font-bold">把 FinTrack 裝起來</p>
                <p className="mt-0.5 text-xs text-ink-2">
                  桌面或主畫面一點就開,不用每次找網址,離線也打得開
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => close(true)}
                className="flex-1 rounded-full border-2 border-line-soft py-1.5 text-sm text-ink-2 transition hover:border-ink hover:text-ink"
              >
                不用了
              </button>
              <button
                onClick={install}
                className="flex-1 rounded-full border-2 border-ink bg-mango py-1.5 font-round text-sm font-bold transition hover:bg-mango-d"
              >
                {route === "prompt" ? "安裝" : "怎麼裝?"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
