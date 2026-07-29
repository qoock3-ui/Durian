import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * React 沒有攔到的例外會把整棵樹卸載,畫面直接變空白——使用者形容起來就是
 * 「閃退」,而且看不出跟記憶體不足有什麼差別。掃描器包在這裡面,至少壞掉時
 * 還看得到是什麼壞了,其餘頁面也不會跟著消失。
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode; onClose?: () => void; label?: string },
  { message: string | null }
> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[FinTrack]", this.props.label ?? "元件", error, info.componentStack);
  }

  render() {
    if (this.state.message === null) return this.props.children;
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
        <div className="w-full max-w-md rounded-card border-2 border-ink bg-paper p-5">
          <h3 className="font-round text-lg font-bold">{this.props.label ?? "這個功能"}出錯了</h3>
          <p className="mt-2 text-sm text-ink-2">
            其他功能都還在,可以先關掉再試一次。
          </p>
          <p className="mt-2 break-words rounded-mid border-2 border-line-soft bg-card px-3 py-2 text-xs text-ink-3">
            {this.state.message}
          </p>
          <button
            onClick={() => {
              this.setState({ message: null });
              this.props.onClose?.();
            }}
            className="mt-4 w-full rounded-full border-2 border-ink bg-mango px-4 py-2 font-round text-sm font-bold"
          >
            關閉
          </button>
        </div>
      </div>
    );
  }
}
