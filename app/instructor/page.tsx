"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getMyRoleOrThrow } from "@/lib/getRole";
import type { AppRole } from "@/lib/getRole";

type Info = { email: string; id: string; role: AppRole } | { err: string };

export default function InstructorEntryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<Info>({ err: "" });

  useEffect(() => {
    const run = async () => {
      try {
        const { user, role } = await getMyRoleOrThrow();

        if (role !== "instructor" && role !== "admin") {
          router.replace("/dashboard");
          return;
        }

        setInfo({ email: user.email ?? "", id: user.id, role });
        setLoading(false);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setInfo({ err: msg });
        router.replace("/login");
      }
    };
    run();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <p>読み込み中...</p>
      </main>
    );
  }

  const isErr = "err" in info;

  return (
    <main className="min-h-screen bg-black text-white p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Instructor Home</h1>
        <button onClick={handleLogout} className="px-4 py-2 bg-red-600 rounded">
          ログアウト
        </button>
      </div>

      <div className="border border-gray-800 rounded p-4">
        {isErr ? (
          <p className="text-red-400">{info.err}</p>
        ) : (
          <>
            <p className="text-sm text-gray-300">
              email: <span className="text-yellow-300">{info.email}</span>
            </p>
            {/* <p className="text-sm text-gray-300">
              user.id: <span className="text-yellow-300">{info.id}</span>
            </p> */}
            <p className="text-sm text-gray-300">
              role: <span className="text-yellow-300">{info.role}</span>
            </p>
          </>
        )}
      </div>

      <div className="space-y-2">
        <button
          onClick={() => router.push("/instructor/search")}
          className="w-full px-4 py-3 bg-gray-700 rounded"
        >
          生徒検索へ
        </button>
        {/* <button
          onClick={() => router.push("/instructor/scan")}
          className="w-full px-4 py-3 bg-gray-700 rounded"
        >
          QRスキャンへ
        </button> */}
      </div>
    </main>
  );
}