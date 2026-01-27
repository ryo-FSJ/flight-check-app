"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getMyRoleOrThrow } from "@/lib/getRole";

type StudentProfile = {
  user_id: string;
  name_romaji: string | null;
  username: string | null;
  role: "student";
};

export default function InstructorSearchPage() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [q, setQ] = useState("");
  const [students, setStudents] = useState<StudentProfile[]>([]);
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
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setErrorMsg(msg);
        router.replace("/login");
      }
    };
    init();
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
        .from("profiles")
        .select("user_id,name_romaji,username,role")
        .eq("role", "student")
        .or(`name_romaji.ilike.%${keyword}%,username.ilike.%${keyword}%`)
        .order("name_romaji", { ascending: true })
        .limit(30);

      if (error) throw new Error(error.message);

      // role が student のものだけに絞る（型安全）
      const rows = (data ?? []).filter(
        (r): r is StudentProfile => r.role === "student"
      );

      setStudents(rows);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
    } finally {
      setSearching(false);
    }
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
        <h1 className="text-2xl font-bold">生徒検索</h1>
        <button onClick={() => router.push("/instructor")} className="px-4 py-2 bg-gray-700 rounded">
          戻る
        </button>
      </div>

      <section className="border border-gray-800 rounded p-4 space-y-3">
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="name_romaji または username で検索"
            className="flex-1 px-3 py-2 rounded bg-gray-900 border border-gray-700"
          />
          <button
            onClick={searchStudents}
            disabled={searching}
            className="px-4 py-2 bg-blue-600 rounded disabled:opacity-60"
          >
            {searching ? "検索中..." : "検索"}
          </button>
        </div>

        {errorMsg && <p className="text-sm text-red-400">エラー: {errorMsg}</p>}

        {students.length > 0 ? (
          <ul className="divide-y divide-gray-800 border border-gray-800 rounded">
            {students.map((s) => (
              <li key={s.user_id} className="p-3 flex items-center justify-between">
                <div className="text-sm">
                  <div className="font-medium">{s.name_romaji ?? "(no name)"}</div>
                  <div className="text-xs text-gray-400 break-all">{s.username ?? ""}</div>
                  <div className="text-xs text-gray-500 break-all">{s.user_id}</div>
                </div>
                <button
                  onClick={() => router.push(`/instructor/student/${encodeURIComponent(s.user_id)}`)}
                  className="px-3 py-2 bg-gray-700 rounded text-sm"
                >
                  開く
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">検索結果はここに出ます</p>
        )}
      </section>
    </main>
  );
}