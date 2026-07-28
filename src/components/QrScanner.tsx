import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { GhostButton, ModalShell, PrimaryButton } from "./ui";

/**
 * 掃電子發票證明聯上的 QR Code。
 *
 * 一張發票印了兩個 QR:左邊那個含發票號碼、日期與金額(記帳與對獎只需要
 * 它),右邊那個只是品項明細的續篇。所以左碼掃到就可以送出,右碼是加分。
 *
 * iOS 的幾個地雷都踩過了:
 * - <video> 一定要 playsInline,否則 Safari 會強制全螢幕播放接管畫面。
 * - getUserMedia 只在 HTTPS(或 localhost)下存在,且必須由使用者手勢觸發
 *   ——這個元件是按鈕按下去才掛載的,已經滿足。
 * - Safari 沒有 BarcodeDetector,所以一律備妥 jsQR 這條純 JS 的路。
 * - 相機真的開不起來時(權限被拒、舊版 iOS、內嵌瀏覽器),還有「拍一張
 *   照片」的退路:input capture 會直接叫出系統相機,成功率最高。
 */

type Detected = { rawValue: string };
type DetectorCtor = new (opts: { formats: string[] }) => {
  detect(source: CanvasImageSource): Promise<Detected[]>;
};

/** Chromium 系原生解碼,比 jsQR 快也吃得下較糊的畫面。Safari 沒有 */
const NativeDetector = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;

/**
 * 解碼前的縮圖上限。發票左碼約 57×57 個模組,一個模組留 2 像素就認得出來,
 * 640px 的畫面裡條碼只要佔到四分之一寬就綽綽有餘;單張照片只有一次機會,
 * 給到 1600px,拍遠一點也還讀得到。
 *
 * 這兩個數字直接決定峰值記憶體:getImageData 每次都會配一塊 w×h×4 的新陣列,
 * 收不回去的話 iOS 會直接把分頁收掉。640×480 一格約 1.2MB,搭配下面的
 * SCAN_INTERVAL 等於每秒約 5MB 的垃圾,是 GC 追得上的量。
 */
const MAX_VIDEO_EDGE = 640;
const MAX_PHOTO_EDGE = 1600;

/** 對著靜止的發票,一秒掃四次已經很夠用 */
const SCAN_INTERVAL = 250;

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
  /** getUserMedia 有時既不成功也不拋錯就這樣掛著(LINE、IG 這類內嵌瀏覽器
   *  最常見),久了就主動把拍照那條路指出來,不要讓人乾等 */
  const [slow, setSlow] = useState(false);
  /** 解一張照片要一兩秒,沒有回饋會被當成當掉 */
  const [decoding, setDecoding] = useState(false);
  /** 加一就重開相機 */
  const [camera, setCamera] = useState(0);

  // 掃描迴圈讀的是 ref,不然每次 setState 都要重啟整個相機
  const leftRef = useRef<string | null>(null);
  const rightRef = useRef<string | null>(null);
  /** 手動關掉相機後要讓掃描迴圈也跟著停,不能只靠 effect 的 cleanup */
  const offRef = useRef(false);

  /** 只建一次。原本每格畫面都 new 一個,等於每秒丟掉八個解碼器 */
  const getDetector = useCallback(() => {
    if (!NativeDetector) return null;
    if (!detectorRef.current) detectorRef.current = new NativeDetector({ formats: ["qr_code"] });
    return detectorRef.current;
  }, []);

  /**
   * 關掉相機並釋放。系統相機一叫出來,這個分頁就退到背景,而持有 MediaStream
   * 的背景分頁正是 iOS 最先回收的對象——回來時整個 App 已經重載,看起來就像
   * 閃退。所以拍照前先主動放手。
   */
  const stopCamera = useCallback(() => {
    offRef.current = true;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setReady(false);
  }, []);

  const restartCamera = () => {
    offRef.current = false;
    setError("");
    setSlow(false);
    setCamera((c) => c + 1);
  };

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
   * 解碼前一律先把畫面縮進上限。手機拍出來的照片是 4032×3024,直接
   * getImageData 會一口氣要 48MB,iOS Safari 不會報錯,它直接把整個分頁收掉
   * ——使用者看到的就是「閃退」。
   *
   * 發票左碼約 57×57 個模組,一個模組留 2 個像素就夠認,所以即時畫面 800px、
   * 照片 1600px 都遠遠夠用。
   */
  const decode = useCallback(
    async (
      source: CanvasImageSource,
      sw: number,
      sh: number,
      maxEdge: number,
      thorough = false,
    ) => {
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

      const detector = getDetector();
      if (detector) {
        try {
          const found = await detector.detect(canvas);
          if (found.length) return found.map((f) => f.rawValue);
        } catch {
          // 原生解碼失敗就走 jsQR,不用讓使用者知道
        }
      }
      const { data } = ctx.getImageData(0, 0, w, h);
      // 逐格掃描要快,單張照片只有一次機會就掃仔細一點
      const found = jsQR(data, w, h, {
        inversionAttempts: thorough ? "attemptBoth" : "dontInvert",
      });
      return found?.data ? [found.data] : null;
    },
    [getDetector],
  );

  // 相機:掛載時開,卸載時務必關掉,否則 iOS 的相機指示燈會一直亮著
  useEffect(() => {
    let stop = false;
    let timer = 0;
    offRef.current = false;
    const slowTimer = window.setTimeout(() => !stop && setSlow(true), 5000);

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("這個瀏覽器不給網頁開相機,請改用下方的拍照上傳");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // ideal 而非 exact:沒有後鏡頭的裝置才不會直接失敗
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
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

        const tick = async () => {
          if (stop || offRef.current) return;
          try {
            const v = videoRef.current;
            if (v && v.readyState >= 2 && v.srcObject) {
              const codes = await decode(v, v.videoWidth, v.videoHeight, MAX_VIDEO_EDGE);
              if (codes) for (const code of codes) accept(code);
            }
          } catch {
            // 單格解碼失敗不該讓整個迴圈死掉
          }
          // 兩碼都到手就不用再燒電了
          if (!stop && !offRef.current && !(leftRef.current && rightRef.current)) {
            timer = window.setTimeout(tick, SCAN_INTERVAL);
          }
        };
        tick();
      } catch (e) {
        const name = (e as { name?: string }).name;
        setError(
          name === "NotAllowedError"
            ? "相機權限被拒絕。可以到瀏覽器設定開啟,或直接用下方的拍照上傳"
            : "開不了相機,請改用下方的拍照上傳",
        );
      }
    })();

    return () => {
      stop = true;
      clearTimeout(timer);
      clearTimeout(slowTimer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [accept, decode, camera]);

  /** 相機不通時的退路:iOS 上 capture 會直接開系統相機 */
  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setDecoding(true);
    // createImageBitmap 可以 close() 當場把那張 12MP 的點陣圖還回去,
    // <img> 只能等 GC ——差別在峰值,而峰值就是 iOS 決定要不要收掉分頁的依據
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

  // 兩碼都到齊就自動送出,不用再按一次。上層重繪不該讓它送第二次
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

  return (
    <ModalShell title="掃發票" onClose={onClose}>
      <div className="relative overflow-hidden rounded-mid border-2 border-ink bg-ink/90 aspect-[4/3]">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="h-full w-full object-cover"
        />
        {/* 取景框,讓人知道要把發票放中間 */}
        <div className="pointer-events-none absolute inset-6 rounded-mid border-2 border-dashed border-paper/70" />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-paper">
            {decoding ? (
              "辨識中…"
            ) : offRef.current ? (
              <button
                onClick={restartCamera}
                className="rounded-full border-2 border-paper px-4 py-2 text-sm font-medium"
              >
                重新開啟相機
              </button>
            ) : error ? null : slow ? (
              "相機遲遲開不起來,改用下面的「拍照上傳」比較快"
            ) : (
              "開啟相機中…"
            )}
          </div>
        )}
      </div>

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
        {left
          ? "讀到了。想連品項一起帶進來就再對準右邊那個碼,不然直接按完成"
          : "把發票下方左邊那個 QR Code 對進框裡"}
      </p>

      {error && (
        <p className="mt-3 rounded-mid border-2 border-danger bg-p-rose/40 px-3 py-2 text-xs">{error}</p>
      )}

      <div className="mt-4 flex gap-2">
        <label className="flex-1">
          <span className="block cursor-pointer rounded-full border-2 border-ink bg-card px-4 py-2 text-center text-sm font-medium">
            拍照上傳
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            // 系統相機開起來前先把 MediaStream 放掉,不然這個分頁很容易被 iOS 回收
            onClick={stopCamera}
            onChange={(e) => {
              onPhoto(e.target.files?.[0]);
              // 清掉才能連拍同一個檔名兩次
              e.target.value = "";
            }}
          />
        </label>
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
