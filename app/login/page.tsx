"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AppRole = "student" | "instructor" | "admin";
type RoleRow = { role: AppRole } | null;

function isSafeNextPath(p: string | null): p is string {
  if (!p) return false;
  return p.startsWith("/") && !p.startsWith("//");
}

async function ensureMyProfileName(): Promise<void> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw new Error(userErr.message);

  const user = userData.user;
  if (!user) throw new Error("Auth session missing");

  const nrRaw = user.user_metadata?.name_romaji;
  const nr = (typeof nrRaw === "string" ? nrRaw : "").trim();
  if (!nr) return; // metadataに無ければ何もしない

  // ① まず update（既存行があればこれで終わる）
  const { data: updated, error: updErr } = await supabase
    .from("profiles")
    .update({ name_romaji: nr })
    .eq("user_id", user.id)
    .select("user_id")
    .maybeSingle<{ user_id: string }>();

  if (updErr) throw new Error(updErr.message);
  if (updated?.user_id) return;

  // ② なければ insert
  const { error: insErr } = await supabase.from("profiles").insert({
    user_id: user.id,
    name_romaji: nr,
  });

  if (insErr) throw new Error(insErr.message);
}

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const nextParam = sp.get("next");
  const nextPath = isSafeNextPath(nextParam) ? nextParam : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const getMyRole = async (): Promise<AppRole> => {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw new Error(userErr.message);
    if (!userData.user) throw new Error("ログインユーザーが見つかりません");

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle<RoleRow>();

    if (profErr) throw new Error(profErr.message);

    return (prof?.role ?? "student") as AppRole;
  };

  const handleLogin = async () => {
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage("ログイン失敗：" + error.message);
      return;
    }

    // ✅ ログイン後にプロフィール名を確実に反映（roleは触らない）
    try {
      await ensureMyProfileName();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage("プロフィール名の保存に失敗：" + msg);
      // ここで止める（role判定できても名前が入らないと困るなら）
      // 止めたくないなら return を消して先に進めてもOK
      return;
    }

    try {
      const role = await getMyRole();

      // instructor/admin は next があればそこへ。なければ /instructor
      if (role === "instructor" || role === "admin") {
        router.replace(nextPath ?? "/instructor");
        return;
      }

      // student は必ず /dashboard（next が instructor でも無視）
      router.replace("/dashboard");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage("role取得失敗: " + msg);
      router.replace("/dashboard");
    }
  };

  const goSignup = () => {
    const q = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    router.push(`/signup${q}`);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-center">ログイン</h1>

        {nextPath && (
          <p className="text-xs text-gray-400 text-center break-all">
            ログイン後に戻る先: {nextPath}
          </p>
        )}

        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 rounded bg-gray-800"
        />

        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-3 rounded bg-gray-800"
        />

        <button onClick={handleLogin} className="w-full py-3 bg-blue-600 rounded text-lg">
          ログイン
        </button>


        <button onClick={goSignup} className="w-full py-3 bg-gray-600 rounded text-lg">
          新規登録はこちら
        </button>

        {message && <p className="text-center text-sm text-gray-300 whitespace-pre-line">{message}</p>}
      </div>
    </main>
  );
}