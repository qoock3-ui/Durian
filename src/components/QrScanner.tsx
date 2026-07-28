import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { GhostButton, ModalShell, PrimaryButton } from "./ui";

/**
 * 掃電子發票證明聯上的 QR Code。
 *
 * 一張發票印了兩個 QR:左邊那個含發票號碼、日期與金額(記帳與對獎只需要
 * 它),右邊那個只是品項明細的續篇。所以左碼掃到就可以送出,右碼是加分。
 *
 * 這裡有兩條路,而且「拍照」是預設的那條:
 *
 * - 拍照:叫出系統相機拍一張,解一次就結束。不持有相機串流、沒有逐格迴圈,
 *   在 WebView、舊機、記憶體吃緊的手機上都還撐得住。
 * - 即時掃描:對著發票連續解碼,快得多,但它要一直握著相機、一直配置畫面
 *   緩衝區,是所有回報過的閃退唯一的共通點。所以改成使用者自己開,而且上
 *   一次開了之後沒有正常關掉(代表分頁被系統收掉),下次就自動退回拍照。
 */

type Detected = { rawValue: string };
type DetectorCtor = new (opts: { formats: string[] }) => {
  detect(source: CanvasImageSource): Promise<Detected[]>;
};
type DetectorStatic = DetectorCtor & { getSupportedFormats?: () => Promise<string[]> };

/** Chromium 系原生解碼,比 jsQR 快也吃得下較糊的畫面。Safari 沒有 */
const NativeDetector = (globalThis as { BarcodeDetector?: DetectorStatic }).BarcodeDetector;

/**
 * 解碼前的縮圖上限。發票左碼約 57×57 個模組,一個模組留 2 像素就認得出來,
 * 640px 的畫面裡條碼只要佔到四分之一寬就綽綽有餘;單張照片只有一次機會,
 * 給到 1600px,拍遠一點也還讀得到。
 */
const MAX_VIDEO_EDGE = 640;
const MAX_PHOTO_EDGE = 1600;

/** 對著靜止的發票,一秒掃三次已經很夠用 */
const SCAN_INTERVAL = 300;

/** 連續掃這麼久還沒讀到就把相機收起來,等使用者按一下再繼續 */
const SCAN_TIMEOUT = 90_000;

/**
 * 即時掃描開始時寫進去、正常關閉時清掉。下次開啟時它還在,就代表上一輪是
 * 被系統收掉的——那台手機撐不住逐格解碼,直接讓它從拍照開始。
 */
const CRASH_KEY = "fintrack_live_scan_open";

const readFlag = () => {
  try {
    return localStorage.getItem(CRASH_KEY) === "1";
  } catch {
    return false;
  }
};
const writeFlag = (on: boolean) => {
  try {
    if (on) localStorage.setItem(CRASH_KEY, "1");
    else localStorage.removeItem(CRASH_KEY);
  } catch {
    // 無痕模式寫不了就算了,頂多少一層保護
  }
};

const isRight = (s: string) => s.trim().startsWith("**");

export default function QrScanner({
  onResult,
  onClose,
  busy,
}: {
  onResult: (codes: { left: string; right?: string }) => void;
  onClose: () => void;
  busy?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<InstanceType<DetectorCtor> | null>(null);

  const [left, setLeft] = useState<string | null>(null);
  const [right, setRight] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [decoding, setDecoding] = useState(false);
  /** 上一輪即時掃描沒有正常收尾,這次就先不要自動開相機 */
  const [crashed] = useState(readFlag);
  const [live, setLive] = useState(false);

  const leftRef = useRef<string | null>(null);
  const rightRef = useRef<string | null>(null);

  /**
   * 原生解碼器只建一次,而且要先問過它認不認 qr_code——有些 Android 機型有
   * BarcodeDetector 但沒有 QR 後端,盲用會永遠回空陣列,掃再久也掃不到。
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!NativeDetector) return;
      try {
        const formats = (await NativeDetector.getSupportedFormats?.()) ?? ["qr_code"];
        if (alive && formats.includes("qr_code")) {
          detectorRef.current = new NativeDetector({ formats: ["qr_code"] });
        }
      } catch {
        // 用不了就算了,jsQR 本來就是保底那條
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const accept = useCallback((raw: string) => {
    if (isRight(raw)) {
      if (rightRef.current) return false;
      rightRef.current = raw;
      setRight(raw);
    } else {
      if (leftRef.current) return false;
      leftRef.current = raw;
      setLeft(raw);
    }
    return true;
  }, []);

  /**
   * 把來源縮進上限後畫進 canvas,再交給解碼器。
   *
   * 有原生解碼器就只問它,空陣列代表這格真的沒有——不要再跑一次 jsQR。原本
   * 兩套輪流跑,而「還沒對準」的每一格都會兩套都跑完,那正是機器被拖垮的
   * 時候。縮圖也是必要的:手機照片 4032×3024 直接 getImageData 要 48MB,
   * iOS Safari 不報錯,它直接把分頁收掉。
   */
  const decode = useCallback(
    async (source: CanvasImageSource, sw: number, sh: number, maxEdge: number, thorough = false) => {
      const canvas = canvasRef.current;
      if (!canvas || !sw || !sh) return null;
      const scale = Math.min(1, maxEdge / Math.max(sw, sh));
      const w = Math.round(sw * scale);
      const h = Math.round(sh * scale);
      // 尺寸沒變就別重設,設定 width/height 會把整塊 backing store 重配一次
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(source, 0, 0, w, h);

      const detector = detectorRef.current;
      if (detector) {
        try {
          const found = await detector.detect(canvas);
          return found.length ? found.map((f) => f.rawValue) : null;
        } catch {
          // 壞過一次就永久退回 jsQR,不要每格都再試一遍
          detectorRef.current = null;
        }
      }
      const { data } = ctx.getImageData(0, 0, w, h);
      // 逐格掃描要快,單張照片只有一次機會就掃仔細一點
      const found = jsQR(data, w, h, {
        inversionAttempts: thorough ? "attemptBoth" : "dontInvert",
      });
      return found?.data ? [found.data] : null;
    },
    [],
  );

  const stopLive = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    writeFlag(false);
    setReady(false);
    setLive(false);
  }, []);

  // 即時掃描。只有使用者自己按下去才會跑
  useEffect(() => {
    if (!live) return;
    let stop = false;
    let timer = 0;
    writeFlag(true);

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("這個瀏覽器不給網頁開相機,請用拍照掃描");
        setLive(false);
        writeFlag(false);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // ideal 而非 exact:沒有後鏡頭的裝置才不會直接失敗。
          // 解析度壓在 960——反正解碼前還會縮到 640,要那麼大只是多佔記憶體
          video: { facingMode: { ideal: "environment" }, width: { ideal: 960 } },
          audio: false,
        });
        if (stop) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setReady(true);

        const startedAt = Date.now();
        const tick = async () => {
          if (stop) return;
          try {
            const v = videoRef.current;
            if (v && v.readyState >= 2 && v.srcObject) {
              const codes = await decode(v, v.videoWidth, v.videoHeight, MAX_VIDEO_EDGE);
              if (codes) for (const code of codes) accept(code);
            }
          } catch {
            // 單格解碼失敗不該讓整個迴圈死掉
          }
          if (!leftRef.current && Date.now() - startedAt > SCAN_TIMEOUT) {
            setError("掃了一陣子還是讀不到,改用拍照掃描試試");
            stopLive();
            return;
          }
          // 兩碼都到手就不用再燒電了
          if (!stop && !(leftRef.current && rightRef.current)) {
            timer = window.setTimeout(tick, SCAN_INTERVAL);
          }
        };
        tick();
      } catch (e) {
        const name = (e as { name?: string }).name;
        setError(
          name === "NotAllowedError"
            ? "相機權限被拒絕,可以到瀏覽器設定開啟,或直接用拍照掃描"
            : "開不了相機,請用拍照掃描",
        );
        setLive(false);
        writeFlag(false);
      }
    })();

    return () => {
      stop = true;
      clearTimeout(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      writeFlag(false);
      // canvas 的 backing store 也還回去,不然它會活到 GC 心情好為止
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, [live, accept, decode, stopLive]);

  /** 拍一張來解。相機 App 會接管畫面,所以先把串流放掉再說 */
  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setDecoding(true);
    // createImageBitmap 可以 close() 當場把那張 12MP 的點陣圖還回去,
    // <img> 只能等 GC ——差別在峰值,而峰值就是系統決定要不要收掉分頁的依據
    let bitmap: ImageBitmap | null = null;
    let img: HTMLImageElement | null = null;
    let url = "";
    try {
      let source: CanvasImageSource;
      let sw: number;
      let sh: number;
      if (typeof createImageBitmap === "function") {
        bitmap = await createImageBitmap(file);
        source = bitmap;
        sw = bitmap.width;
        sh = bitmap.height;
      } else {
        url = URL.createObjectURL(file);
        img = new Image();
        img.src = url;
        await img.decode();
        source = img;
        sw = img.naturalWidth;
        sh = img.naturalHeight;
      }
      // 縮到 1600 還讀不到就再退一階,遠拍的發票有時要縮小才對得上格線
      let codes = await decode(source, sw, sh, MAX_PHOTO_EDGE, true);
      if (!codes) codes = await decode(source, sw, sh, 900, true);
      if (!codes || !codes.some((c) => accept(c))) {
        setError("這張照片裡讀不到 QR Code,靠近一點、讓條碼填滿畫面再拍一次");
      }
    } catch {
      setError("讀不到這張照片");
    } finally {
      bitmap?.close();
      if (img) img.src = "";
      if (url) URL.revokeObjectURL(url);
      setDecoding(false);
    }
  };

  // 兩碼都到齊就自動送出。上層重繪不該讓它送第二次
  const sent = useRef(false);
  useEffect(() => {
    if (left && right && !sent.current) {
      sent.current = true;
      onResult({ left, right });
    }
  }, [left, right, onResult]);

  const submit = () => {
    if (!left || sent.current) return;
    sent.current = true;
    onResult({ left, right: right ?? undefined });
  };

  const tick = (on: boolean) =>
    `grid h-6 w-6 place-items-center rounded-full border-2 text-xs ${
      on ? "border-ink bg-p-mint" : "border-line-soft text-ink-3"
    }`;

  const photoInput = (
    <input
      type="file"
      accept="image/*"
      capture="environment"
      className="hidden"
      // 系統相機開起來前先把串流放掉,不然這個分頁很容易被系統回收
      onClick={() => live && stopLive()}
      onChange={(e) => {
        onPhoto(e.target.files?.[0]);
        // 清掉才能連拍同一個檔名兩次
        e.target.value = "";
      }}
    />
  );

  return (
    <ModalShell title="掃發票" onClose={onClose}>
      {live ? (
        <div className="relative aspect-[4/3] overflow-hidden rounded-mid border-2 border-ink bg-ink/90">
          <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
          {/* 取景框,讓人知道要把發票放中間 */}
          <div className="pointer-events-none absolute inset-6 rounded-mid border-2 border-dashed border-paper/70" />
          {!ready && (
            <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-paper">
              開啟相機中…
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-mid border-2 border-dashed border-line-soft px-4 py-6 text-center">
          <div className="text-3xl">🧾</div>
          <p className="mt-2 text-sm font-medium">
            {decoding ? "辨識中…" : "拍一張發票下方左邊那個 QR Code"}
          </p>
          <p className="mt-1 text-xs text-ink-3">讓條碼盡量填滿畫面,拍清楚就讀得到</p>
          <label className="mt-4 inline-block">
            <span className="block cursor-pointer rounded-full border-2 border-ink bg-mango px-5 py-2 font-round text-sm font-bold">
              {decoding ? "處理中…" : "拍照掃描"}
            </span>
            {photoInput}
          </label>
          {crashed && (
            <p className="mt-3 text-xs text-ink-3">
              上次即時掃描時 App 被系統關掉了,所以這次先用拍照。
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className={tick(!!left)}>{left ? "✓" : "1"}</span>
          左邊的碼
        </span>
        <span className="flex items-center gap-1.5">
          <span className={tick(!!right)}>{right ? "✓" : "2"}</span>
          右邊的碼(選填)
        </span>
      </div>

      <p className="mt-2 text-center text-xs text-ink-3">
        {left ? "讀到了。想連品項一起帶進來就再讀右邊那個碼,不然直接按完成" : "只要左邊那個碼就能記帳與對獎"}
      </p>

      {error && (
        <p className="mt-3 rounded-mid border-2 border-danger bg-p-rose/40 px-3 py-2 text-xs">{error}</p>
      )}

      <div className="mt-4 flex gap-2">
        {live ? (
          <label className="flex-1">
            <span className="block cursor-pointer rounded-full border-2 border-ink bg-card px-4 py-2 text-center text-sm font-medium">
              改用拍照
            </span>
            {photoInput}
          </label>
        ) : (
          <GhostButton className="flex-1" onClick={() => {
            setError("");
            setLive(true);
          }}>
            即時掃描
          </GhostButton>
        )}
        <PrimaryButton className="flex-1" onClick={submit} disabled={!left || busy}>
          {busy ? "處理中…" : "完成"}
        </PrimaryButton>
      </div>

      <div className="mt-2">
        <GhostButton className="w-full" onClick={onClose}>
          取消
        </GhostButton>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </ModalShell>
  );
}
