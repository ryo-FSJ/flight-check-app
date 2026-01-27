"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getMyRoleOrThrow } from "@/lib/getRole";

export default function QrClient() {
  const router = useRouter();
  const sp = useSearchParams();

  useEffect(() => {
    const run = async () => {
      const studentId = sp.get("studentId");
      if (!studentId) {
        router.replace("/login");
        return;
      }

      // まずログイン済みか確認
      try {
        const { role } = await getMyRoleOrThrow();

        // instructor/adminなら生徒編集ページへ
        if (role === "instructor" || role === "admin") {
          router.replace(`/instructor/student/${encodeURIComponent(studentId)}`);
          return;
        }

        // studentが開いた場合は自分のdashboardへ
        router.replace("/dashboard");
      } catch {
        // 未ログインなら login に「戻り先」を付けて飛ばす
        const next = `/instructor/student/${encodeURIComponent(studentId)}`;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
      }
    };

    run();
  }, [router, sp]);

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <p>QR確認中...</p>
    </main>
  );
}