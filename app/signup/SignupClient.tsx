"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function isSafeNextPath(p: string | null): p is string {
  if (!p) return false;
  return p.startsWith("/") && !p.startsWith("//");
}

export default function SignupPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const nextParam = sp.get("next");
  const nextPath = isSafeNextPath(nextParam) ? nextParam : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nameRomaji, setNameRomaji] = useState("");

  // ✅ 招待コード（共有パスワード）
  const [inviteCode, setInviteCode] = useState("");

  const [message, setMessage] = useState("");

  const handleSignUp = async () => {
    setMessage("");

    const nr = nameRomaji.trim();
    if (!nr) {
      setMessage("User名を入力してね（例: ryo）");
      return;
    }

    const ic = inviteCode.trim();
    if (!ic) {
      setMessage("招待コード（共有パスワード）を入力してね");
      return;
    }

    // ✅ 1) auth サインアップ（メール確認あり）
    // ✅    hook が見る invite_code と、name_romaji を user_metadata に入れる
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name_romaji: nr,
          invite_code: ic, // ← hook がここを見る
        },
      },
    });

    if (error) {
      setMessage("登録失敗：" + error.message);
      return;
    }

    // メール確認が必要なら、基本ここでログインできないので案内だけ
    const q = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    setMessage("登録しました。\nメールを確認してからログインしてね。");
    router.replace(`/login${q}`);
  };

  const goLogin = () => {
    const q = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    router.replace(`/login${q}`);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-center">新規登録</h1>

        {nextPath && (
          <p className="text-xs text-gray-400 text-center break-all">
            登録後にログインしたら戻る先: {nextPath}
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

        <input
          type="text"
          placeholder="User名 例: Ryo"
          value={nameRomaji}
          onChange={(e) => setNameRomaji(e.target.value)}
          className="w-full p-3 rounded bg-gray-800"
        />

        {/* ✅ 招待コード入力を追加 */}
        <input
          type="password"
          placeholder="招待コード（共有パスワード）"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          className="w-full p-3 rounded bg-gray-800"
        />

        <button onClick={handleSignUp} className="w-full py-3 bg-blue-600 rounded text-lg">
          新規登録
        </button>

        <button onClick={goLogin} className="w-full py-3 bg-gray-600 rounded text-lg">
          ログインへ戻る
        </button>

        {message && <p className="text-center text-sm text-gray-300 whitespace-pre-line">{message}</p>}
      </div>
    </main>
  );
}