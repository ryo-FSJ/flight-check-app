import { Suspense } from "react";
import QrClient from "./QrClient";

export default function QrEntryPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-black text-white p-6"><p>QR確認中...</p></main>}>
      <QrClient />
    </Suspense>
  );
}