import Link from "next/link";

export default function Home() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold text-center">
        フライトチェックアプリ
      </h1>


      <div className="mt-8">
        <Link href="/login">
          <button className="w-full py-3 bg-blue-600 text-white rounded-lg text-lg">
            ログイン
          </button>
        </Link>
      </div>
    </main>
  );
}