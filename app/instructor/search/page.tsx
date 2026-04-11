"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getMyRoleOrThrow } from "@/lib/getRole";

type StudentProfileRow = {
  id: string;
  owner_user_id: string;
  name_romaji: string;
  sort_order: number;
  created_at?: string;
};

export default function InstructorSearchPage() {
  const router = useRouter();

  const [booting, setBooting] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [q, setQ] = useState("");
  const [students, setStudents] = useState<StudentProfileRow[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const { role } = await getMyRoleOrThrow();

        if (role !== "instructor" && role !== "admin") {
          router.replace("/dashboard");
          return;
        }

        setBooting(false);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        setErrorMsg(msg);
        router.replace("/login");
      }
    };

    void init();
  }, [router]);

  const searchStudents = async () => {
    setSearching(true);
    setErrorMsg("");

    try {
      const keyword = q.trim();

      if (!keyword) {
        setStudents([]);
        return;
      }

      const { data, error } = await supabase
        .from("student_profiles")
        .select("id,owner_user_id,name_romaji,sort_order,created_at")
        .ilike("name_romaji", `%${keyword}%`)
        .order("name_romaji", { ascending: true })
        .limit(30);

      if (error) {
        throw new Error(error.message);
      }

      setStudents((data ?? []) as StudentProfileRow[]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setErrorMsg(msg);
    } finally {
      setSearching(false);
    }
  };

  if (booting) {
    return (
      <main className="min-h-[100dvh] bg-black text-white px-4 py-5 sm:px-6 sm:py-6">
        <p>読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-black text-white px-4 py-5 sm:px-6 sm:py-6">
      <div className="mb-5 rounded-[1.618rem] border border-gray-800 bg-gray-950/70 px-4 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="text-[0.72rem] uppercase tracking-[0.22em] text-gray-500">
              Instructor Tools
            </p>
            <h1 className="text-[1.9rem] leading-none font-bold">生徒検索</h1>
            <p className="text-sm text-gray-400">
              student名（name_romaji）で検索
            </p>
          </div>

          <button
            onClick={() => router.push("/instructor")}
            className="rounded-2xl bg-gray-700 px-4 py-2.5 text-sm font-medium transition hover:bg-gray-600"
          >
            戻る
          </button>
        </div>
      </div>

      <section className="rounded-[1.618rem] border border-gray-800 bg-gray-950/55 px-4 py-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="student名で検索（例: ヤマダ タロウ ）"
            className="flex-1 rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-white outline-none placeholder:text-gray-500 focus:border-indigo-500"
          />
          <button
            onClick={searchStudents}
            disabled={searching}
            className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-medium transition hover:bg-blue-500 disabled:opacity-60"
          >
            {searching ? "検索中..." : "検索"}
          </button>
        </div>

        {errorMsg && <p className="mt-3 text-sm text-red-400">エラー: {errorMsg}</p>}

        <div className="mt-4">
          {students.length > 0 ? (
            <ul className="space-y-3">
              {students.map((s) => (
                <li
                  key={s.id}
                  className="rounded-[1rem] border border-gray-800 bg-black/25 px-4 py-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1 text-sm">
                      <div className="text-base font-medium text-white">
                        {s.name_romaji || "(no name)"}
                      </div>
                      <div className="text-xs text-gray-500 break-all">
                        student_profile_id: {s.id}
                      </div>
                      <div className="text-xs text-gray-600 break-all">
                        owner_user_id: {s.owner_user_id}
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        router.push(`/instructor/student/${encodeURIComponent(s.id)}`)
                      }
                      className="rounded-2xl bg-gray-700 px-4 py-2.5 text-sm font-medium transition hover:bg-gray-600"
                    >
                      開く
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">検索結果はここに出ます</p>
          )}
        </div>
      </section>
    </main>
  );
}