import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { StoreProvider } from "./store";
import "./index.css";
// 這個 import 不能拿掉:它會在 React 掛載前接住 beforeinstallprompt,
// 那個事件只觸發一次,晚一步就再也拿不到了
import "./lib/install";

// PWA:安裝到主畫面 + 離線開得起來。註冊失敗不影響 App 運作。
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <App />
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>,
);
