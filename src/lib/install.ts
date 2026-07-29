/**
 * PWA 安裝狀態。
 *
 * beforeinstallprompt 會在頁面剛載入時就觸發,而且**只觸發一次**——等 React
 * 掛好再掛監聽器就來不及了。所以這個模組在 main.tsx 最前面被 import,
 * 事件先接住存起來,元件之後再來問。
 */

export type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** 這台裝置怎麼裝:prompt 是瀏覽器自己會跳,safari 系列只能教使用者手動 */
export type InstallRoute = "prompt" | "ios" | "mac-safari" | null;

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // 攔下瀏覽器預設的迷你提示,改由我們自己挑時機顯示
    e.preventDefault();
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 已經是安裝後開起來的視窗了 */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  if (window.matchMedia?.("(display-mode: window-controls-overlay)").matches) return true;
  // iOS Safari 沒有 display-mode,用它自己的旗標
  if ((navigator as { standalone?: boolean }).standalone) return true;
  return document.referrer.startsWith("android-app://");
}

/**
 * 判斷這台裝置該走哪條安裝路線。
 *
 * Chrome、Edge(桌機與 Android)會給 beforeinstallprompt,一鍵就能裝。
 * Safari 兩邊都不給,只能教:iOS 是「分享 → 加入主畫面」,macOS 14 之後
 * 是「分享 → 加入程式塢」。Firefox 桌機版不支援安裝,就不要騙人按了。
 */
export function installRoute(): InstallRoute {
  if (deferred) return "prompt";
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  const isSafari = /safari/i.test(ua) && !/chrome|chromium|crios|fxios|edg|android/i.test(ua);
  if (!isSafari) return null;
  // iPadOS 會謊報成 Mac,靠觸控點數再確認一次
  const iOSLike = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  return iOSLike ? "ios" : "mac-safari";
}

/** 跳出瀏覽器原生的安裝對話框。回傳使用者是否真的裝了 */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  // 一個 beforeinstallprompt 只能用一次,用掉就丟
  deferred = null;
  notify();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === "accepted";
}
