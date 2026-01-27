"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getMyRoleOrThrow } from "@/lib/getRole";
import { extractStudentIdFromText } from "@/lib/qr";

export default function InstructorScanPage() {
  const router = useRouter();

  const [booting, setBooting] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [scanText, setScanText] = useState("");
  const [scanMsg, setScanMsg] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const canUseBarcodeDetector = useMemo(() => {
    return typeof window !== "undefined" && typeof BarcodeDetector !== "undefined";
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const { role } = await getMyRoleOrThrow();
        if (role !== "instructor" && role !== "admin") {
          router.replace("/dashboard");
          return;
        }
        setBooting(false);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setErrorMsg(msg);
        router.replace("/login");
      }
    };
    init();

    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const stopCamera = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startCameraAndScan = async () => {
    setScanMsg("");

    if (!canUseBarcodeDetector || !BarcodeDetector) {
      setScanMsg("このブラウザはQR自動検出に非対応です。下の入力欄にURL/IDを貼ってください。");
      return;
    }

    try {
      stopCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      streamRef.current = stream;

      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const detector = new BarcodeDetector({ formats: ["qr_code"] });

      const tick = async () => {
        const v = videoRef.current;
        if (!v) return;

        try {
          const barcodes = await detector.detect(v);
          if (barcodes.length > 0) {
            const raw = barcodes[0].rawValue ?? "";
            if (raw) {
              setScanText(raw);
              const studentId = extractStudentIdFromText(raw);
              if (studentId) {
                stopCamera();
                router.push(`/instructor/student/${encodeURIComponent(studentId)}`);
                return;
              }
            }
          }
        } catch {
          // 検出失敗は継続
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setScanMsg("カメラ起動に失敗しました。ブラウザのカメラ許可を確認してね。");
    }
  };

  const openStudentFromText = () => {
    setScanMsg("");
    const studentId = extractStudentIdFromText(scanText);
    if (!studentId) {
      setScanMsg("URLまたは studentId を入力してね");
      return;
    }
    router.push(`/instructor/student/${encodeURIComponent(studentId)}`);
  };

  if (booting) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <p>読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">QRスキャン</h1>
        <button onClick={() => router.push("/instructor")} className="px-4 py-2 bg-gray-700 rounded">
          戻る
        </button>
      </div>

      {errorMsg && (
        <div className="border border-red-800 rounded p-4">
          <p className="text-red-400">エラー: {errorMsg}</p>
        </div>
      )}

      <section className="border border-gray-800 rounded p-4 space-y-3">
        <div className="flex gap-2">
          <button onClick={startCameraAndScan} className="px-4 py-2 bg-green-700 rounded">
            スキャン開始（カメラ）
          </button>
          <button onClick={stopCamera} className="px-4 py-2 bg-gray-700 rounded">
            停止
          </button>
        </div>

        <div className="bg-gray-900/40 border border-gray-800 rounded p-3">
          <video ref={videoRef} className="w-full rounded" playsInline muted />
          <p className="text-xs text-gray-500 mt-2">
            ※ iPhone/Safari などでQR自動検出が動かない場合があります。その場合は下にURLを貼ってOK。
          </p>
          {!canUseBarcodeDetector && (
            <p className="text-xs text-yellow-400 mt-1">
              BarcodeDetector 非対応のため、自動検出は使えません（貼り付けでOK）。
            </p>
          )}
        </div>

        <div className="space-y-2">
          <input
            value={scanText}
            onChange={(e) => setScanText(e.target.value)}
            placeholder="QRのURL or /instructor/student/... or studentId を貼る"
            className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700"
          />
          <button onClick={openStudentFromText} className="w-full px-4 py-2 bg-blue-600 rounded">
            この生徒を開く
          </button>
          {scanMsg && <p className="text-sm text-yellow-400">{scanMsg}</p>}
        </div>
      </section>
    </main>
  );
}