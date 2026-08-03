import { useCallback, useMemo, useState } from "react";
import { ApiError, del, post } from "../api";
import { useStore } from "../store";
import { Badge, Bubble, Card, EmptyState, GhostButton, ModalShell, PrimaryButton, Toast } from "../components/ui";
import QrScanner from "../components/QrScanner";
import ErrorBoundary from "../components/ErrorBoundary";
import FormModal from "../components/FormModal";
import CategoryManager from "../components/CategoryManager";
import { AwardStatus, useAwards } from "../components/Awards";
import { invoiceFields } from "../components/entityForms";
import { PRIZE_LABEL, claimDeadline, drawDate, periodLabel } from "../../shared/invoice";
import type { Invoice } from "../lib/constants";
import { fmtTWD } from "../lib/finance";

type ScanCodes = { left: string; right?: string };

/** 一張發票現在處於什麼狀態,顯示與底色都看它 */
function statusOf(inv: Invoice, today: string) {
  if (inv.prize_tier === null) {
    if (drawDate(inv.period) > today) {
      // 這顆標籤跟金額擠同一欄,寫成 9/25 才不會把名稱壓掉
      const [, m, d] = drawDate(inv.period).split("-");
      return { text: `${Number(m)}/${Number(d)} 開獎`, tint: "bg-p-stone", won: false };
    }
    return { text: "等待對獎", tint: "bg-p-butter", won: false };
  }
  if (inv.prize_tier === "none") return { text: "沒中獎", tint: "bg-p-stone", won: false };
  return {
    text: `${PRIZE_LABEL[inv.prize_tier]} ${fmtTWD(inv.prize_amount ?? 0)}`,
    tint: "bg-p-mint",
    won: true,
  };
}

function itemNames(inv: Invoice): string {
  try {
    const items = JSON.parse(inv.items ?? "[]") as { name: string }[];
    return items.map((i) => i.name).join("、");
  } catch {
    return "";
  }
}

/** 掃完後的確認畫面,讓人看得到到底記了什麼進去 */
function ScanResult({ invoice, onClose, onAgain }: { invoice: Invoice; onClose: () => void; onAgain: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const status = statusOf(invoice, today);
  const names = itemNames(invoice);
  return (
    <ModalShell title="記好了" onClose={onClose}>
      <Card tint={status.won ? "bg-p-mint" : "bg-p-sky"}>
        <p className="tnum font-round text-3xl font-bold">{fmtTWD(invoice.total_amount)}</p>
        {invoice.seller_name && <p className="mt-1 truncate text-sm font-medium">{invoice.seller_name}</p>}
        <p className="tnum mt-1 text-xs text-ink-2">
          {invoice.inv_num} · {invoice.inv_date}
        </p>
        {names && <p className="mt-1 truncate text-xs text-ink-2">{names}</p>}
        <p className="mt-2 border-t-2 border-dashed border-ink/15 pt-2 text-xs text-ink-2">
          已記成一筆花費 · {status.text}
        </p>
      </Card>
      <p className="mt-3 text-xs text-ink-3">
        分類是依品名猜的,到「花費」頁就能改。發票正本請留著,中獎要憑正本兌領。
      </p>
      <div className="mt-4 flex gap-2">
        <GhostButton className="flex-1" onClick={onClose}>
          關閉
        </GhostButton>
        <PrimaryButton className="flex-1" onClick={onAgain}>
          再掃一張
        </PrimaryButton>
      </div>
    </ModalShell>
  );
}

export default function Invoices() {
  const { invoices, refresh, cats } = useStore();
  const { awards, reloadAwards } = useAwards();
  const [scanning, setScanning] = useState(false);
  const [typing, setTyping] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [patch, setPatch] = useState<Record<string, string> | undefined>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Invoice | null>(null);
  const [toast, setToast] = useState("");

  const today = new Date().toISOString().slice(0, 10);

  const stats = useMemo(() => {
    let won = 0;
    let pending = 0;
    for (const i of invoices) {
      if (i.prize_amount) won += i.prize_amount;
      if (i.prize_tier === null) pending++;
    }
    return { won, pending };
  }, [invoices]);

  /** 依期別分組,新的在上面 */
  const periods = useMemo(() => {
    const map = new Map<string, Invoice[]>();
    for (const i of invoices) {
      const list = map.get(i.period);
      if (list) list.push(i);
      else map.set(i.period, [i]);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [invoices]);

  /** 已開獎但號碼還沒到手的期別。這是「等待對獎」卡住的唯一原因,要講出來 */
  const missing = useMemo(() => new Set(awards?.missing ?? []), [awards]);

  const onScan = useCallback(
    async (codes: ScanCodes) => {
      setBusy(true);
      try {
        const r = await post<{ invoice: Invoice }>("/api/invoices/scan", codes);
        setScanning(false);
        setResult(r.invoice);
        // 發票同時是一筆花費,兩邊都要重抓
        await refresh("invoices");
        await refresh("expenses");
      } catch (e) {
        setScanning(false);
        setToast(e instanceof ApiError ? e.message : "掃描失敗,再試一次");
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  /** 手動輸入。錯誤訊息要浮上來,不然使用者不知道是號碼格式不對還是重複 */
  const saveManual = async (values: Record<string, unknown>) => {
    const r = await post<{ invoice: Invoice }>("/api/invoices", values);
    await refresh("invoices");
    await refresh("expenses");
    setResult(r.invoice);
  };

  const remove = async (inv: Invoice) => {
    if (!confirm(`刪除發票 ${inv.inv_num}?連同它記下的那筆花費一起刪除。`)) return;
    await del(`/api/invoices/${inv.id}`);
    await refresh("invoices");
    await refresh("expenses");
  };

  const recheck = async () => {
    setBusy(true);
    try {
      const r = await post<{ periods: number; checked: number; sent: number; mailError: string }>(
        "/api/invoices/awards/refresh",
        {},
      );
      await refresh("invoices");
      await reloadAwards();
      // 寄信失敗不會讓這次呼叫變成錯誤(號碼還是抓到了),所以要自己講出來
      setToast(
        r.mailError
          ? `已更新 ${r.periods} 期號碼,對了 ${r.checked} 張,但通知信寄不出去`
          : `已更新 ${r.periods} 期號碼,對了 ${r.checked} 張,寄出 ${r.sent} 封通知`,
      );
    } catch (e) {
      // 抓不到的時候,真正的原因照原文丟出來。使用者才判斷得出是暫時的還是該找人
      setToast(e instanceof ApiError ? e.detail || e.message : "財政部的號碼抓不到,稍後再試");
    } finally {
      setBusy(false);
    }
  };

  /** 管理者補完號碼後,發票與獎號兩邊都要重抓 */
  const afterManualAward = async (checked: number) => {
    await refresh("invoices");
    await reloadAwards();
    setToast(`已對 ${checked} 張`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-round text-2xl font-bold">發票</h1>
        <div className="flex gap-2">
          <GhostButton onClick={() => setTyping(true)}>手動輸入</GhostButton>
          <PrimaryButton onClick={() => setScanning(true)}>＋ 掃發票</PrimaryButton>
        </div>
      </div>

      <Card tint="bg-p-sky">
        <p className="text-sm text-ink-2">中獎金額合計</p>
        <p className="tnum mt-1 font-round text-3xl font-bold">{fmtTWD(stats.won)}</p>
        <p className="tnum mt-1 text-xs text-ink-2">
          共 {invoices.length} 張{stats.pending > 0 && ` · ${stats.pending} 張待對獎`}
        </p>
        <AwardStatus awards={awards} busy={busy} onRefresh={recheck} onManualSaved={afterManualAward} />
      </Card>

      {invoices.length === 0 ? (
        <Card>
          <EmptyState
            text="還沒有發票"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <PrimaryButton onClick={() => setScanning(true)}>掃第一張</PrimaryButton>
                <GhostButton onClick={() => setTyping(true)}>手動輸入</GhostButton>
              </div>
            }
          />
        </Card>
      ) : (
        periods.map(([period, items]) => {
          const sum = items.reduce((s, i) => s + i.total_amount, 0);
          const drawn = drawDate(period) <= today;
          return (
            <Card key={period}>
              <div className="flex items-baseline justify-between border-b-2 border-dashed border-line-soft pb-2">
                <div className="min-w-0">
                  <span className="font-round text-sm font-bold">{periodLabel(period)}</span>
                  <span className="ml-2 text-xs text-ink-3">
                    {drawn ? `領獎至 ${claimDeadline(period)}` : `${drawDate(period)} 開獎`}
                  </span>
                </div>
                <span className="tnum shrink-0 text-xs text-ink-3">{fmtTWD(sum)}</span>
              </div>
              {/* 號碼還沒到手就講清楚,不然這幾張只會一直寫著「等待對獎」,看起來像壞了 */}
              {drawn && missing.has(period) && (
                <p className="mt-2 rounded-mid border-2 border-ink/15 bg-p-butter px-3 py-1.5 text-xs text-ink-2">
                  已開獎,但還沒拿到這期的中獎號碼,所以底下這幾張還停在等待對獎。
                </p>
              )}
              <ul className="divide-y-2 divide-line-soft">
                {items.map((inv) => {
                  const status = statusOf(inv, today);
                  const names = itemNames(inv);
                  return (
                    <li key={inv.id} className="flex items-center gap-2 py-2.5 sm:gap-3">
                      <Bubble tint={status.won ? "bg-p-mint" : "bg-p-stone"} size="sm">
                        {status.won ? "🎉" : "🧾"}
                      </Bubble>
                      {/* 有店名就用店名當標題,發票號碼退到副標——QR 給不了店名,
                          手動輸入的才有,兩種都要好認 */}
                      <div className="min-w-0 flex-1">
                        <div className={`truncate font-medium ${inv.seller_name ? "" : "tnum"}`}>
                          {inv.seller_name || inv.inv_num}
                        </div>
                        <div className="truncate text-xs text-ink-3">
                          {inv.seller_name ? `${inv.inv_num} · ` : ""}
                          {inv.inv_date}
                          {names ? ` · ${names}` : ""}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="tnum font-round text-xs font-bold sm:text-base">
                          {fmtTWD(inv.total_amount)}
                        </div>
                        <Badge className={status.tint}>{status.text}</Badge>
                      </div>
                      <button
                        onClick={() => remove(inv)}
                        aria-label="刪除"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-line-soft text-xs transition hover:border-danger hover:text-danger"
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })
      )}

      {/* 掃描器要碰相機與解碼器,是最容易出事的一塊,壞掉不該把整個 App 帶走 */}
      {scanning && (
        <ErrorBoundary label="掃描器" onClose={() => setScanning(false)}>
          <QrScanner onResult={onScan} onClose={() => setScanning(false)} busy={busy} />
        </ErrorBoundary>
      )}

      {typing && (
        <FormModal
          title="手動輸入發票"
          fields={invoiceFields(cats, () => setAddingCategory(true))}
          initial={{ inv_date: new Date().toISOString().slice(0, 10) }}
          patch={patch}
          onSubmit={saveManual}
          onClose={() => {
            setTyping(false);
            setPatch(undefined);
          }}
        />
      )}

      {addingCategory && (
        <CategoryManager
          initialKind="expense"
          autoAdd
          onCreated={(c) => setPatch({ category: c.key })}
          onClose={() => setAddingCategory(false)}
        />
      )}

      {result && (
        <ScanResult
          invoice={result}
          onClose={() => setResult(null)}
          onAgain={() => {
            setResult(null);
            setScanning(true);
          }}
        />
      )}

      {toast && <Toast text={toast} onDone={() => setToast("")} />}
    </div>
  );
}
