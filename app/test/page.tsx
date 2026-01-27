"use client";

import { supabase } from "@/lib/supabase";

export default function TestPage() {
  const testConnection = async () => {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      alert("エラー：" + error.message);
    } else {
      alert("Supabase 接続OK 🎉");
      console.log(data);
    }
  };

  return (
    <main className="p-6">
      <h1 className="text-xl font-bold mb-4">Supabase 接続テスト</h1>
      <button
        onClick={testConnection}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        テストする
      </button>
    </main>
  );
}