import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, get, put } from "../api";
import { useStore } from "../store";
import { Badge, GhostButton, ModalShell, PrimaryButton, inputClass } from "./ui";
import { periodLabel } from "../../shared/invoice";

/**
 * 對獎的「這件事到底進行到哪」都放這裡。
 *
 * 發票頁本身只負責顯示發票,但使用者最常卡住的不是發票,是「為什麼一直
 * 等待對獎」——那要看中獎號碼在不在手上、上次去抓是什麼時候、失敗又是為
 * 什麼。這些狀態獨立成一塊,發票頁只要把它擺進摘要卡就好。
 */

export type Award = {
  period: string;
  special: string;
  grand: string;
  first: string[];
  extra_sixth: string[];
  updated_at: string;
  /** rss 是從財政部抓的,manual 是管理者手動補的 */
  source: "rss" | "manual";
  drawn: boolean;
};

export type AwardsState = {
  awards: Award[];
  /** 上一次去抓號碼的結果,從來沒抓過是 null */
  lastFetch: { at: string; ok: boolean; detail: string } | null;
  /** 使用者有發票、期別也開獎了,但號碼還沒到手的期別 */
  missing: string[];
};

/** 對獎狀態的載入。抓不到就沿用上一份,這塊是說明用的,不該把發票頁弄壞 */
export function useAwards() {
  const [state, setState] = useState<AwardsState | null>(null);

  const reload = useCallback(async () => {
    try {
      setState(await get<AwardsState>("/api/invoices/awards"));
    } catch {
      // 靜靜略過,畫面會顯示「還沒抓過中獎號碼」
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { awards: state, reloadAwards: reload };
}

/** SQLite 存的是 UTC 的 "YYYY-MM-DD HH:MM:SS",瀏覽器要補 Z 才不會當成本地時間 */
function parseUtc(at: string): number {
  return Date.parse(at.replace(" ", "T") + "Z");
}

/** 距今多久。超過一週就直接寫日期,「38 天前」沒有比日期好懂 */
function sinceLabel(at: string): string {
  const t = parseUtc(at);
  if (Number.isNaN(t)) return at;
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return "剛剛";
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `${days} 天前`;
  return new Date(t).toLocaleDateString("zh-TW");
}

const chipClass =
  "rounded-full border-2 border-ink/20 px-3 py-1 text-xs text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-50";

/**
 * 對獎狀態區塊。放在摘要卡底下,講三件事:號碼是什麼時候抓的、抓失敗的話
 * 是為什麼、以及結果會寄到哪個信箱。
 */
export function AwardStatus({
  awards,
  busy,
  onRefresh,
  onManualSaved,
}: {
  awards: AwardsState | null;
  busy: boolean;
  onRefresh: () => void;
  /** 管理者補完號碼後,由發票頁去重抓發票與獎號 */
  onManualSaved: (checked: number) => void;
}) {
  const { user } = useStore();
  const [showNumbers, setShowNumbers] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const drawnAwards = useMemo(
    () => (awards?.awards ?? []).filter((a) => a.drawn).sort((a, b) => (a.period < b.period ? 1 : -1)),
    [awards],
  );
  const last = awards?.lastFetch ?? null;

  // 缺號碼的期別裡挑最新的當預設,那是使用者現在盯著看的那一期
  const defaultPeriod =
    [...(awards?.missing ?? [])].sort().pop() ?? drawnAwards[0]?.period ?? "";

  return (
    <div className="mt-2 border-t-2 border-dashed border-ink/15 pt-2">
      <p className="text-xs text-ink-2">
        {last === null
          ? "還沒抓過中獎號碼"
          : last.ok
            ? `上次抓到中獎號碼:${sinceLabel(last.at)}`
            : `上次去抓沒有成功:${sinceLabel(last.at)}`}
        {drawnAwards.length > 0 && ` · 手上有 ${drawnAwards.length} 期`}
      </p>

      {/* 失敗原因照抄後端的話。講「稍後再試」等於什麼都沒講,使用者也就無從判斷要不要找人 */}
      {last && !last.ok && last.detail && (
        <p className="mt-1 break-words text-xs text-ink-3">原因:{last.detail}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <button onClick={onRefresh} disabled={busy} className={chipClass}>
          {busy ? "更新中…" : "重新抓中獎號碼"}
        </button>
        <button onClick={() => setShowNumbers(true)} className={chipClass}>
          本期中獎號碼
        </button>
        {user?.is_admin && (
          <button onClick={() => setShowManual(true)} className={chipClass}>
            手動輸入中獎號碼
          </button>
        )}
      </div>

      {user?.email && (
        <p className="mt-2 text-xs text-ink-3">
          一期的發票全部對完後,結果會寄到 {user.email},沒中也會寄一次。
        </p>
      )}

      {showNumbers && <AwardNumbersModal awards={drawnAwards} onClose={() => setShowNumbers(false)} />}

      {showManual && (
        <ManualAwardModal
          missing={awards?.missing ?? []}
          defaultPeriod={defaultPeriod}
          onClose={() => setShowManual(false)}
          onSaved={(checked) => {
            setShowManual(false);
            onManualSaved(checked);
          }}
        />
      )}
    </div>
  );
}

/** 號碼一列一列排,手機上會換行不會撐寬 */
function NumberRow({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="flex gap-2 py-1">
      <span className="w-16 shrink-0 text-xs text-ink-3">{label}</span>
      <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
        {values.map((n) => (
          <span key={n} className="tnum text-sm font-medium tracking-wide">
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * 中獎號碼一覽。
 *
 * 這不是除錯面板——是讓人可以拿著螢幕跟財政部公布的號碼一項一項核對。
 * 我們說「沒中獎」的時候,他要有辦法自己確認我們沒對錯。
 */
function AwardNumbersModal({ awards, onClose }: { awards: Award[]; onClose: () => void }) {
  return (
    <ModalShell title="中獎號碼" onClose={onClose}>
      {awards.length === 0 ? (
        <p className="text-sm text-ink-2">目前手上一期號碼都沒有,按「重新抓中獎號碼」再試一次。</p>
      ) : (
        <div className="space-y-4">
          {awards.map((a) => (
            <div key={a.period} className="rounded-mid border-2 border-line-soft p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-round text-sm font-bold">{periodLabel(a.period)}</span>
                {a.source === "manual" && <Badge className="bg-p-butter">手動輸入</Badge>}
              </div>
              <NumberRow label="特別獎" values={a.special ? [a.special] : []} />
              <NumberRow label="特獎" values={a.grand ? [a.grand] : []} />
              <NumberRow label="頭獎" values={a.first} />
              <NumberRow label="增開六獎" values={a.extra_sixth} />
              <p className="mt-2 text-xs text-ink-3">更新於 {sinceLabel(a.updated_at)}</p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-ink-3">
        頭獎後三碼相同就是六獎,對獎是拿發票號碼末幾碼跟這些號碼比。
      </p>
      <div className="mt-4">
        <GhostButton className="w-full" onClick={onClose}>
          關閉
        </GhostButton>
      </div>
    </ModalShell>
  );
}

/** 逗號、頓號、空白或換行都當分隔,貼上公告時不必先整理格式 */
function splitNumbers(text: string): string[] {
  return text
    .split(/[\s,、,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 管理者專用:手動補一期的中獎號碼。
 *
 * 財政部的 RSS 有斷過,而號碼不到手,整期發票就會一直掛在「等待對獎」。
 * 與其等來源修好,不如留一條照著公告自己打進去的路。
 */
function ManualAwardModal({
  missing,
  defaultPeriod,
  onClose,
  onSaved,
}: {
  missing: string[];
  defaultPeriod: string;
  onClose: () => void;
  onSaved: (checked: number) => void;
}) {
  const [period, setPeriod] = useState(defaultPeriod);
  const [special, setSpecial] = useState("");
  const [grand, setGrand] = useState("");
  const [first, setFirst] = useState("");
  const [extra, setExtra] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await put<{ checked: number }>(`/api/invoices/awards/${encodeURIComponent(period.trim())}`, {
        special: special.trim(),
        grand: grand.trim(),
        first: splitNumbers(first),
        extra_sixth: splitNumbers(extra),
      });
      onSaved(r.checked);
    } catch (err) {
      // 後端的訊息會指名是哪一欄有問題,原文照登比重寫成通用句子有用
      setError(err instanceof ApiError ? err.detail || err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const label = "mb-1 block text-xs font-medium text-ink-2";

  return (
    <ModalShell title="手動輸入中獎號碼" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-ink-2">
          照財政部公告輸入,存檔後會立刻幫所有人重對這一期。
        </p>

        <div>
          <label className={label} htmlFor="award-period">
            期別
          </label>
          <input
            id="award-period"
            className={inputClass}
            placeholder="2026-03"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            required
          />
          {missing.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {missing.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className="rounded-full border-2 border-line-soft px-2.5 py-1 text-xs text-ink-2 transition hover:border-ink hover:text-ink"
                >
                  缺 {periodLabel(p)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className={label} htmlFor="award-special">
            特別獎
          </label>
          <input
            id="award-special"
            className={`${inputClass} tnum`}
            inputMode="numeric"
            placeholder="八位數字"
            value={special}
            onChange={(e) => setSpecial(e.target.value)}
            required
          />
        </div>

        <div>
          <label className={label} htmlFor="award-grand">
            特獎
          </label>
          <input
            id="award-grand"
            className={`${inputClass} tnum`}
            inputMode="numeric"
            placeholder="八位數字"
            value={grand}
            onChange={(e) => setGrand(e.target.value)}
            required
          />
        </div>

        <div>
          <label className={label} htmlFor="award-first">
            頭獎
          </label>
          <textarea
            id="award-first"
            className={`${inputClass} tnum h-20 resize-none`}
            placeholder="一行一組,或用逗號分隔"
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            required
          />
        </div>

        <div>
          <label className={label} htmlFor="award-extra">
            增開六獎(沒有就留空)
          </label>
          <input
            id="award-extra"
            className={`${inputClass} tnum`}
            placeholder="三位數字,多組用逗號分隔"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
          />
        </div>

        {error && <p className="break-words text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <GhostButton onClick={onClose}>取消</GhostButton>
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? "存檔中…" : "存檔並對獎"}
          </PrimaryButton>
        </div>
      </form>
    </ModalShell>
  );
}
