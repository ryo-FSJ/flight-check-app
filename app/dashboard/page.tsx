"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "@/lib/supabase";

type AppRole = "student" | "instructor" | "admin" | null;

type StepRow = { id: string; name: string; sort_order: number | null };
type CategoryRow = { id: string; step_id: string; name: string; sort_order: number | null };

// ✅ video_url を追加
type CheckItemRow = {
  id: string;
  category_id: string;
  title: string;
  sort_order: number | null;
  video_url?: string | null;
};

type UserItemCheckRow = {
  item_id: string;
  user_id: string;
  is_cleared: boolean;
  cleared_at: string | null;
  cleared_by: string | null;
};

type ProfileRow = {
  user_id: string;
  role: AppRole;
  name_romaji: string | null;
};

type ViewItem = CheckItemRow & { status?: UserItemCheckRow };

// ✅ progress を持たせる
type ViewCategory = CategoryRow & { items: ViewItem[]; progressPct: number };
type ViewStep = StepRow & { categories: ViewCategory[] };

function clampPct(n: number) {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

// ✅ YouTube URL → embed URL に変換（YouTube以外は弾く）
function toYoutubeEmbedUrl(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  try {
    const u = new URL(s);

    const host = u.hostname.replace(/^www\./, "");
    const isYoutube =
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com" ||
      host === "youtu.be";

    if (!isYoutube) return null;

    // youtu.be/<id>
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (!id) return null;
      return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
    }

    // youtube.com/watch?v=<id>
    const v = u.searchParams.get("v");
    if (v) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v)}`;

    // youtube.com/embed/<id>
    if (u.pathname.startsWith("/embed/")) {
      const id = u.pathname.split("/")[2];
      if (!id) return null;
      return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
    }

    // youtube.com/shorts/<id>
    if (u.pathname.startsWith("/shorts/")) {
      const id = u.pathname.split("/")[2];
      if (!id) return null;
      return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
    }

    return null;
  } catch {
    return null;
  }
}

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [myRole, setMyRole] = useState<AppRole>(null);
  const [myNameRomaji, setMyNameRomaji] = useState<string>("");

  const [steps, setSteps] = useState<StepRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [items, setItems] = useState<CheckItemRow[]>([]);
  const [checks, setChecks] = useState<UserItemCheckRow[]>([]);

  // QRモーダル
  const [showQr, setShowQr] = useState(false);
  const [studentId, setStudentId] = useState<string>("");

  // ✅ カテゴリ開閉（前回追加したのと同じ思想）
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const toggleCat = (catId: string) => setOpenCats((p) => ({ ...p, [catId]: !p[catId] }));

  // ✅ 動画モーダル
  const [showVideo, setShowVideo] = useState(false);
  const [videoTitle, setVideoTitle] = useState<string>("");
  const [videoEmbedUrl, setVideoEmbedUrl] = useState<string | null>(null);
  const [videoMsg, setVideoMsg] = useState<string>("");

  const openVideo = (title: string, url?: string | null) => {
    setVideoMsg("");
    const embed = url ? toYoutubeEmbedUrl(url) : null;

    if (!url) {
      setVideoMsg("この項目には動画が設定されていません");
      return;
    }
    if (!embed) {
      setVideoMsg("YouTubeのURLのみ対応です（watch / youtu.be / shorts / embed）");
      return;
    }

    setVideoTitle(title);
    setVideoEmbedUrl(embed);
    setShowVideo(true);
  };

  useEffect(() => {
    const fail = (msg: string) => {
      setErrorMsg(msg);
      setLoading(false);
    };

    const init = async () => {
      setLoading(true);
      setErrorMsg("");

      // 1) ログインチェック
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) return fail(userErr.message);

      if (!userData.user) {
        router.replace("/login");
        return;
      }

      const userId = userData.user.id;
      setStudentId(userId);

      // 2) role + name_romaji 取得
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("user_id,role,name_romaji")
        .eq("user_id", userId)
        .maybeSingle<ProfileRow>();

      if (profErr) return fail(profErr.message);

      const role = (prof?.role ?? "student") as AppRole;
      setMyRole(role);
      setMyNameRomaji((prof?.name_romaji ?? "").trim());

      // instructor/admin が /dashboard に来たら /instructor へ
      if (role === "instructor" || role === "admin") {
        router.replace("/instructor");
        return;
      }

      // 3) データ取得（自分の進捗だけ）
      const [stepsRes, categoriesRes, itemsRes, checksRes] = await Promise.all([
        supabase.from("steps").select("id,name,sort_order").order("sort_order", { ascending: true }),
        supabase.from("categories").select("id,step_id,name,sort_order").order("sort_order", { ascending: true }),
        // ✅ video_url も取る
        supabase
          .from("check_items")
          .select("id,category_id,title,sort_order,video_url")
          .order("sort_order", { ascending: true }),
        supabase
          .from("user_item_checks")
          .select("item_id,user_id,is_cleared,cleared_at,cleared_by")
          .eq("user_id", userId),
      ]);

      if (stepsRes.error) return fail(stepsRes.error.message);
      if (categoriesRes.error) return fail(categoriesRes.error.message);
      if (itemsRes.error) return fail(itemsRes.error.message);
      if (checksRes.error) return fail(checksRes.error.message);

      setSteps((stepsRes.data ?? []) as StepRow[]);
      setCategories((categoriesRes.data ?? []) as CategoryRow[]);
      setItems((itemsRes.data ?? []) as CheckItemRow[]);
      setChecks((checksRes.data ?? []) as UserItemCheckRow[]);

      setLoading(false);
    };

    init();
  }, [router]);

  // 表示用に組み立て（progressPct もここで計算）
  const viewData: ViewStep[] = useMemo(() => {
    const checkMap = new Map<string, UserItemCheckRow>();
    for (const c of checks) checkMap.set(c.item_id, c);

    const itemsByCategory = new Map<string, ViewItem[]>();
    for (const it of items) {
      const list = itemsByCategory.get(it.category_id) ?? [];
      list.push({ ...it, status: checkMap.get(it.id) });
      itemsByCategory.set(it.category_id, list);
    }

    const categoriesByStep = new Map<string, ViewCategory[]>();
    for (const cat of categories) {
      const its = itemsByCategory.get(cat.id) ?? [];
      const total = its.length;
      const cleared = its.filter((x) => x.status?.is_cleared === true).length;
      const pct = total === 0 ? 0 : clampPct((cleared / total) * 100);

      const list = categoriesByStep.get(cat.step_id) ?? [];
      list.push({ ...cat, items: its, progressPct: pct });
      categoriesByStep.set(cat.step_id, list);
    }

    return steps.map((st) => ({ ...st, categories: categoriesByStep.get(st.id) ?? [] }));
  }, [steps, categories, items, checks]);

  const qrUrl = useMemo(() => {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    return `${origin}/instructor/student/${encodeURIComponent(studentId)}`;
  }, [studentId]);

  const [copyMsg, setCopyMsg] = useState<string>("");

  const copyQrUrl = async () => {
    setCopyMsg("");
    try {
      await navigator.clipboard.writeText(qrUrl);
      setCopyMsg("コピーしました ✅");
      window.setTimeout(() => setCopyMsg(""), 1500);
    } catch {
      setCopyMsg("コピーできませんでした（手動で選択してコピーしてね）");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-black text-white p-4">
        <p>読み込み中...</p>
      </main>
    );
  }

  if (errorMsg) {
    return (
      <main className="min-h-[100dvh] bg-black text-white p-4">
        <p className="text-red-400">エラー: {errorMsg}</p>
        <button
          onClick={() => router.replace("/login")}
          className="mt-4 w-full px-4 py-3 bg-gray-700 rounded-xl"
        >
          ログインへ
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-black text-white p-4">
      {/* ヘッダー */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="text-sm text-gray-400 flex flex-wrap gap-x-3 gap-y-1">
            <span>role: {myRole ?? "-"}</span>
            {myNameRomaji ? <span>name: {myNameRomaji}</span> : <span className="text-gray-600">name: -</span>}
          </div>

          {/* ✅ 動画の注意メッセージ（任意） */}
          {videoMsg && <p className="text-xs text-yellow-300 mt-1">{videoMsg}</p>}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowQr(true)}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-gray-700 rounded-xl"
          >
            QRを表示
          </button>
          <button
            onClick={handleLogout}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-red-600 rounded-xl"
          >
            ログアウト
          </button>
        </div>
      </div>

      {/* 本体 */}
      {viewData.length === 0 ? (
        <p className="text-gray-300">データがありません（steps が空かも）</p>
      ) : (
        <div className="space-y-6">
          {viewData.map((step) => (
            <section key={step.id} className="border border-gray-800 rounded-xl p-4">
              <h2 className="text-xl font-semibold mb-3">{step.name}</h2>

              {step.categories.length === 0 ? (
                <p className="text-gray-400">このStepにカテゴリがありません</p>
              ) : (
                <div className="space-y-5">
                  {step.categories.map((cat) => {
                    const isOpen = !!openCats[cat.id];

                    return (
                      <div key={cat.id} className="bg-gray-900/40 rounded-xl p-4">
                        {/* ✅ カテゴリ：タップで開閉 + 進捗% */}
                        <button
                          type="button"
                          onClick={() => toggleCat(cat.id)}
                          className="w-full flex items-center justify-between gap-3 text-left"
                        >
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-semibold">{cat.name}</h3>
                            <span className="text-xs px-2 py-1 rounded-lg border border-gray-700 text-gray-300">
                              {cat.progressPct}%
                            </span>
                          </div>
                          <span className="text-sm text-gray-400">{isOpen ? "▲" : "▼"}</span>
                        </button>

                        {isOpen && (
                          <div className="mt-3">
                            {cat.items.length === 0 ? (
                              <p className="text-gray-400">このカテゴリに項目がありません</p>
                            ) : (
                              <ul className="space-y-2">
                                {cat.items.map((it) => {
                                  const cleared = it.status?.is_cleared === true;

                                  return (
                                    <li key={it.id} className="border border-gray-800 rounded-xl px-4 py-3">
                                      {/* ✅ タイトルを押すと動画モーダル */}
                                      <button
                                        type="button"
                                        onClick={() => openVideo(it.title, it.video_url)}
                                        className="w-full text-left"
                                      >
                                        <div className="text-base leading-relaxed font-medium whitespace-pre-wrap underline underline-offset-4 decoration-gray-600">
                                          {it.title}
                                        </div>
                                        {it.video_url ? (
                                          <p className="mt-1 text-xs text-gray-500">動画あり</p>
                                        ) : (
                                          <p className="mt-1 text-xs text-gray-700">動画なし</p>
                                        )}
                                      </button>

                                      <div className="mt-2 flex items-center justify-between">
                                        <span
                                          className={`text-sm px-3 py-1.5 rounded-lg border ${
                                            cleared
                                              ? "text-green-400 border-green-600"
                                              : "text-gray-300 border-gray-600"
                                          }`}
                                        >
                                          {cleared ? "✅ クリア" : "⬜ 未クリア"}
                                        </span>

                                        {/* 任意：更新日時（今のまま残す） */}
                                        {it.status?.cleared_at ? (
                                          <span className="text-xs text-gray-500">
                                            {new Date(it.status.cleared_at).toLocaleString()}
                                          </span>
                                        ) : (
                                          <span className="text-xs text-gray-600">-</span>
                                        )}
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {/* QRモーダル（既存のまま） */}
      {showQr && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
          onClick={() => setShowQr(false)}
        >
          <div
            className="w-full sm:max-w-md bg-gray-950 border border-gray-800 rounded-t-2xl sm:rounded-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">あなたのQR</h2>
              <button onClick={() => setShowQr(false)} className="px-3 py-1.5 rounded-lg bg-gray-800">
                ×
              </button>
            </div>

            <div className="mt-3 space-y-2">
              <p className="text-xs text-gray-400 break-all">{qrUrl}</p>

              <button onClick={copyQrUrl} className="w-full px-4 py-2.5 bg-gray-800 rounded-xl text-sm">
                URLをコピー
              </button>
              {copyMsg && <p className="text-xs text-yellow-300">{copyMsg}</p>}
            </div>

            <div className="mt-4 bg-white rounded-xl p-4 w-fit mx-auto">
              <QRCodeCanvas value={qrUrl} size={260} />
            </div>

            <p className="text-xs text-gray-500 mt-3">
              インストラクターがこのQRをスキャンすると、生徒の進捗ページに移動します。
            </p>

            <button onClick={() => setShowQr(false)} className="mt-4 w-full px-4 py-3 bg-gray-700 rounded-xl">
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* ✅ 動画モーダル（QRと同じ感じ） */}
      {showVideo && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
          onClick={() => setShowVideo(false)}
        >
          <div
            className="w-full sm:max-w-md bg-gray-950 border border-gray-800 rounded-t-2xl sm:rounded-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold line-clamp-2">{videoTitle || "動画"}</h2>
              <button onClick={() => setShowVideo(false)} className="px-3 py-1.5 rounded-lg bg-gray-800">
                ×
              </button>
            </div>

            <div className="mt-4">
              {videoEmbedUrl ? (
                <div className="w-full overflow-hidden rounded-xl border border-gray-800 bg-black">
                  {/* 16:9 */}
                  <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
                    <iframe
                      className="absolute inset-0 w-full h-full"
                      src={videoEmbedUrl}
                      title={videoTitle || "YouTube video"}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">動画を表示できませんでした。</p>
              )}
            </div>

            <button onClick={() => setShowVideo(false)} className="mt-4 w-full px-4 py-3 bg-gray-700 rounded-xl">
              閉じる
            </button>
          </div>
        </div>
      )}
    </main>
  );
}