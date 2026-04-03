"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getMyRoleOrThrow } from "@/lib/getRole";

function isSessionMissingMessage(message: string | undefined): boolean {
  return typeof message === "string" && message.includes("Auth session missing");
}

export default function QrClient() {
  const router = useRouter();
  const sp = useSearchParams();

  useEffect(() => {
    const run = async () => {
      const studentProfileId = sp.get("studentProfileId");

      if (!studentProfileId) {
        router.replace("/login");
        return;
      }

      const nextPath = `/instructor/student/${encodeURIComponent(studentProfileId)}`;

      try {
        const { role } = await getMyRoleOrThrow();

        if (role === "instructor" || role === "admin") {
          router.replace(nextPath);
          return;
        }

        router.replace("/dashboard");
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);

        if (isSessionMissingMessage(msg)) {
          router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
          return;
        }

        router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
      }
    };

    void run();
  }, [router, sp]);

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <p>QR確認中...</p>
    </main>
  );
}