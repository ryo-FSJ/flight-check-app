"use client";

import { useMemo, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

export default function AdminQrPage() {
  const [studentId, setStudentId] = useState("123");

  const url = useMemo(() => {
    // 本番は https://あなたのドメイン に変える
    return `${process.env.NEXT_PUBLIC_BASE_URL}/instructor/student/${encodeURIComponent(studentId)}`;
  }, [studentId]);

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <h1 className="text-2xl font-bold">Admin: QR Generator</h1>

      <div className="mt-6 space-y-3">
        <label className="text-sm text-gray-300">studentId</label>
        <input
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="w-full max-w-md bg-black border border-gray-700 rounded px-3 py-2 text-white"
          placeholder="例: 123 / UUID / public_id"
        />
      </div>

      <div className="mt-8 bg-gray-900/40 border border-gray-800 rounded p-4 inline-block">
        <QRCodeCanvas value={url} size={220} />
        <p className="mt-3 text-xs text-gray-400 break-all">{url}</p>
      </div>
    </main>
  );
}