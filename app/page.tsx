import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white px-6">
      {/* “黄金比っぽい”カード */}
      <div className="w-full max-w-[34rem] flex flex-col items-center">
        {/* ロゴ（サイズ控えめ＋余白はφ寄せ） */}
        <div className="mt-10">
          <Image
            src="/logo.png"
            alt="フライトチェックアプリ ロゴ"
            width={260}
            height={260}
            priority
          />
        </div>

        {/* ロゴ→タイトル間：φっぽく */}
        <h1 className="mt-10 text-2xl font-bold text-center tracking-wide">
          フライトチェックアプリ
        </h1>

        {/* タイトル→ボタン間：さらに少し大きく（φの階層感） */}
        <div className="mt-16 w-full max-w-sm">
          <Link href="/login">
            <button className="w-full py-4 rounded-xl bg-blue-600 font-bold text-lg shadow-sm active:scale-[0.99]">
              ログイン
            </button>
          </Link>
        </div>

        {/* 余白の締め（全体バランス） */}
        <div className="h-12" />
      </div>
    </main>
  );
}