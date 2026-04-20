"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AppRole = "student" | "instructor" | "admin" | null;

type StepRow = { id: string; name: string; sort_order: number | null };
type CategoryRow = { id: string; step_id: string; name: string; sort_order: number | null };

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
  student_profile_id: string | null;
  is_cleared: boolean;
  rating: "S" | "A" | "B" | "C" | null;
  cleared_at: string | null;
  cleared_by: string | null;
};

type ProfileRow = {
  user_id: string;
  name_romaji: string | null;
  role?: AppRole;
};

type StudentProfileRow = {
  id: string;
  owner_user_id: string;
  name_romaji: string;
  sort_order: number;
  created_at?: string;
};

type ViewItem = CheckItemRow & {
  status?: UserItemCheckRow;
  actorName?: string;
};

type ViewCategory = CategoryRow & {
  items: ViewItem[];
  progressPct: number;
};

type ViewStep = StepRow & {
  categories: ViewCategory[];
  progressPct: number;
};

function clampPct(n: number) {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

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

    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }

    const v = u.searchParams.get("v");
    if (v) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v)}`;

    if (u.pathname.startsWith("/embed/")) {
      const id = u.pathname.split("/")[2];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }

    if (u.pathname.startsWith("/shorts/")) {
      const id = u.pathname.split("/")[2];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }

    return null;
  } catch {
    return null;
  }
}

function formatJaDateTime(iso?: string | null) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("ja-JP");
  } catch {
    return iso;
  }
}

export default function InstructorStudentPage() {
  const router = useRouter();
  const params = useParams() as Record<string, string | string[]>;

  const studentIdParam = params["studentId"];
  const studentId =
    typeof studentIdParam === "string"
      ? studentIdParam
      : Array.isArray(studentIdParam)
        ? studentIdParam[0] ?? ""
        : "";

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [myRole, setMyRole] = useState<AppRole>(null);
  const canEdit = myRole === "instructor" || myRole === "admin";

  const [studentNameRomaji, setStudentNameRomaji] = useState("");
  const [studentOwnerUserId, setStudentOwnerUserId] = useState("");

  const [steps, setSteps] = useState<StepRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [items, setItems] = useState<CheckItemRow[]>([]);
  const [checks, setChecks] = useState<UserItemCheckRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);

  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [showVideo, setShowVideo] = useState(false);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoEmbedUrl, setVideoEmbedUrl] = useState<string | null>(null);
  const [videoMsg, setVideoMsg] = useState("");

  const toggleCat = (catId: string) =>
    setOpenCats((prev) => ({ ...prev, [catId]: !prev[catId] }));

  const openVideo = (title: string, url?: string | null) => {
    setVideoMsg("");
    const embed = url ? toYoutubeEmbedUrl(url) : null;

    if (!url) {
      setVideoMsg("この項目には動画が設定されていません");
      return;
    }

    if (!embed) {
      setVideoMsg("YouTubeのURLのみ対応です");
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

      if (!studentId) {
        fail("studentId が見つかりません");
        return;
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser();

      const isSessionMissing =
        !!userErr &&
        typeof userErr.message === "string" &&
        userErr.message.includes("Auth session missing");

      if (isSessionMissing || !userData.user) {
        const nextPath =
          typeof window !== "undefined"
            ? window.location.pathname + window.location.search
            : `/instructor/student/${encodeURIComponent(studentId)}`;

        router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }

      if (userErr) {
        fail(userErr.message);
        return;
      }

      const actorId = userData.user.id;

      const { data: myProf, error: myProfErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", actorId)
        .maybeSingle<{ role: AppRole }>();

      if (myProfErr) {
        fail(myProfErr.message);
        return;
      }

      const role = (myProf?.role ?? "student") as AppRole;
      setMyRole(role);

      if (!(role === "instructor" || role === "admin")) {
        router.replace("/dashboard");
        return;
      }

      const { data: studentProf, error: studentProfErr } = await supabase
        .from("student_profiles")
        .select("id,owner_user_id,name_romaji,sort_order,created_at")
        .eq("id", studentId)
        .maybeSingle<StudentProfileRow>();

      if (studentProfErr) {
        fail(studentProfErr.message);
        return;
      }

      if (!studentProf) {
        fail("student profile が見つかりません");
        return;
      }

      setStudentNameRomaji(studentProf.name_romaji);
      setStudentOwnerUserId(studentProf.owner_user_id);

      const [stepsRes, categoriesRes, itemsRes, checksRes] = await Promise.all([
        supabase
          .from("steps")
          .select("id,name,sort_order")
          .order("sort_order", { ascending: true }),
        supabase
          .from("categories")
          .select("id,step_id,name,sort_order")
          .order("sort_order", { ascending: true }),
        supabase
          .from("check_items")
          .select("id,category_id,title,sort_order,video_url")
          .order("sort_order", { ascending: true }),
        supabase
          .from("user_item_checks")
          .select("item_id,user_id,student_profile_id,is_cleared,rating,cleared_at,cleared_by")
          .eq("student_profile_id", studentId),
      ]);

      if (stepsRes.error) return fail(stepsRes.error.message);
      if (categoriesRes.error) return fail(categoriesRes.error.message);
      if (itemsRes.error) return fail(itemsRes.error.message);
      if (checksRes.error) return fail(checksRes.error.message);

      const checksData = (checksRes.data ?? []) as UserItemCheckRow[];

      setSteps((stepsRes.data ?? []) as StepRow[]);
      setCategories((categoriesRes.data ?? []) as CategoryRow[]);
      setItems((itemsRes.data ?? []) as CheckItemRow[]);
      setChecks(checksData);

      const actorIds = Array.from(
        new Set(
          checksData
            .map((c) => c.cleared_by)
            .filter((v): v is string => typeof v === "string" && v.length > 0)
        )
      );

      if (actorIds.length > 0) {
        const { data: profs, error: profsErr } = await supabase
          .from("profiles")
          .select("user_id,name_romaji")
          .in("user_id", actorIds);

        if (profsErr) return fail(profsErr.message);
        setProfiles((profs ?? []) as ProfileRow[]);
      } else {
        setProfiles([]);
      }

      setLoading(false);
    };

    void init();
  }, [router, studentId]);

  useEffect(() => {
    if (!studentId) return;

    const channel = supabase
      .channel(`uic-instructor-student-${studentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_item_checks",
          filter: `student_profile_id=eq.${studentId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Partial<UserItemCheckRow>;
            if (!oldRow.item_id || !oldRow.student_profile_id) return;

            setChecks((prev) =>
              prev.filter(
                (c) =>
                  !(
                    c.item_id === oldRow.item_id &&
                    c.student_profile_id === oldRow.student_profile_id
                  )
              )
            );
            return;
          }

          const newRow = payload.new as Partial<UserItemCheckRow>;
          if (!newRow.item_id || !newRow.student_profile_id) return;

          setChecks((prev) => {
            const idx = prev.findIndex(
              (c) =>
                c.item_id === newRow.item_id &&
                c.student_profile_id === newRow.student_profile_id
            );

            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { ...next[idx], ...(newRow as UserItemCheckRow) };
              return next;
            }

            return [...prev, newRow as UserItemCheckRow];
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [studentId]);

  const actorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of profiles) {
      map.set(p.user_id, p.name_romaji ?? "Unknown");
    }
    return map;
  }, [profiles]);

  const viewData: ViewStep[] = useMemo(() => {
    const checkMap = new Map<string, UserItemCheckRow>();
    for (const c of checks) checkMap.set(c.item_id, c);

    const itemsByCategory = new Map<string, ViewItem[]>();
    for (const it of items) {
      const status = checkMap.get(it.id);
      const actorName = status?.cleared_by ? actorMap.get(status.cleared_by) : undefined;

      const list = itemsByCategory.get(it.category_id) ?? [];
      list.push({ ...it, status, actorName });
      itemsByCategory.set(it.category_id, list);
    }

    const categoriesByStep = new Map<string, ViewCategory[]>();
    for (const cat of categories) {
      const categoryItems = itemsByCategory.get(cat.id) ?? [];
      const total = categoryItems.length;
      const cleared = categoryItems.filter((x) => x.status?.rating != null).length;
      const pct = total === 0 ? 0 : clampPct((cleared / total) * 100);

      const list = categoriesByStep.get(cat.step_id) ?? [];
      list.push({ ...cat, items: categoryItems, progressPct: pct });
      categoriesByStep.set(cat.step_id, list);
    }

    return steps.map((st) => {
      const stepCategories = categoriesByStep.get(st.id) ?? [];
      const totalItems = stepCategories.reduce((sum, cat) => sum + cat.items.length, 0);
      const totalCleared = stepCategories.reduce(
        (sum, cat) => sum + cat.items.filter((x) => x.status?.rating != null).length,
        0
      );

      return {
        ...st,
        categories: stepCategories,
        progressPct: totalItems === 0 ? 0 : clampPct((totalCleared / totalItems) * 100),
      };
    });
  }, [steps, categories, items, checks, actorMap]);

  const totalProgressPct = useMemo(() => {
    const totalItems = viewData.reduce(
      (sum, step) => sum + step.categories.reduce((s, cat) => s + cat.items.length, 0),
      0
    );
    const totalCleared = viewData.reduce(
      (sum, step) =>
        sum +
        step.categories.reduce(
          (s, cat) => s + cat.items.filter((x) => x.status?.rating != null).length,
          0
        ),
      0
    );

    return totalItems === 0 ? 0 : clampPct((totalCleared / totalItems) * 100);
  }, [viewData]);

  const setRating = async (itemId: string, nextRating: UserItemCheckRow["rating"]) => {
    if (!canEdit) return;
    setErrorMsg("");

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      setErrorMsg(userErr.message);
      return;
    }

    if (!userData.user) {
      const nextPath = `/instructor/student/${encodeURIComponent(studentId)}`;
      router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
      return;
    }

    const instructorId = userData.user.id;
    const prevChecks = checks;
    const nextCleared = nextRating != null;

    const nextRow: UserItemCheckRow = {
      user_id: studentOwnerUserId,
      student_profile_id: studentId,
      item_id: itemId,
      is_cleared: nextCleared,
      rating: nextRating,
      cleared_at: nextCleared ? new Date().toISOString() : null,
      cleared_by: nextCleared ? instructorId : null,
    };

    setChecks((prev) => {
      const exists = prev.find(
        (c) => c.item_id === itemId && c.student_profile_id === studentId
      );

      if (exists) {
        return prev.map((c) =>
          c.item_id === itemId && c.student_profile_id === studentId
            ? { ...c, ...nextRow }
            : c
        );
      }

      return [...prev, nextRow];
    });

    const { data, error } = await supabase
      .from("user_item_checks")
      .upsert(nextRow, { onConflict: "student_profile_id,item_id" })
      .select("item_id,user_id,student_profile_id,is_cleared,rating,cleared_at,cleared_by")
      .single();

    if (error) {
      setChecks(prevChecks);
      setErrorMsg(error.message);
      return;
    }

    if (data) {
      const row = data as UserItemCheckRow;
      setChecks((prev) => {
        const idx = prev.findIndex(
          (c) => c.item_id === row.item_id && c.student_profile_id === row.student_profile_id
        );

        if (idx >= 0) {
          const next = [...prev];
          next[idx] = row;
          return next;
        }

        return [...prev, row];
      });

      if (row.cleared_by && !actorMap.has(row.cleared_by)) {
        const { data: p } = await supabase
          .from("profiles")
          .select("user_id,name_romaji")
          .eq("user_id", row.cleared_by)
          .maybeSingle<ProfileRow>();

        if (p?.user_id) {
          setProfiles((prev) => [...prev, p]);
        }
      }
    }
  };

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-black text-white px-4 py-6">
        <div className="mx-auto max-w-md animate-pulse space-y-4">
          <div className="h-28 rounded-[1.618rem] border border-gray-800 bg-gray-950/70" />
          <div className="h-32 rounded-[1.618rem] border border-gray-800 bg-gray-950/55" />
          <div className="h-32 rounded-[1.618rem] border border-gray-800 bg-gray-950/55" />
        </div>
      </main>
    );
  }

  if (errorMsg) {
    return (
      <main className="min-h-[100dvh] bg-black text-white px-4 py-6">
        <div className="mx-auto max-w-md rounded-[1.618rem] border border-red-900/60 bg-red-950/20 p-5">
          <p className="text-sm text-red-300">エラー: {errorMsg}</p>
          <button
            onClick={() => router.replace("/instructor")}
            className="mt-4 w-full rounded-2xl bg-gray-800 px-4 py-3 text-sm font-medium"
          >
            インストラクターホームへ
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-black text-white px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-md space-y-5 sm:max-w-4xl">
        <section className="rounded-[1.618rem] border border-gray-800 bg-gray-950/70 px-4 py-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="space-y-1">
                <p className="text-[0.68rem] uppercase tracking-[0.24em] text-gray-500">
                  Instructor View
                </p>
                <h1 className="text-[2rem] leading-none font-bold tracking-tight">
                  Student Dashboard
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[0.78rem] text-gray-400">
                <span className="rounded-full border border-gray-800 bg-gray-900/70 px-2.5 py-1">
                  student: {studentNameRomaji || "-"}
                </span>
                <span className="rounded-full border border-gray-800 bg-gray-900/70 px-2.5 py-1">
                  profile_id: {studentId}
                </span>
                <span className="rounded-full border border-indigo-900/70 bg-indigo-950/40 px-2.5 py-1 text-indigo-200">
                  progress: {totalProgressPct}%
                </span>
              </div>

              {videoMsg && (
                <p className="rounded-2xl border border-yellow-800/60 bg-yellow-950/20 px-3 py-2 text-xs text-yellow-300">
                  {videoMsg}
                </p>
              )}
            </div>

            <button
              onClick={() => router.replace("/instructor")}
              className="shrink-0 rounded-2xl bg-gray-800 px-4 py-2.5 text-sm font-medium transition hover:bg-gray-700 active:scale-[0.98]"
            >
              戻る
            </button>
          </div>
        </section>

        {viewData.length === 0 ? (
          <section className="rounded-[1.618rem] border border-gray-800 bg-gray-950/55 px-4 py-5">
            <p className="text-sm text-gray-300">データがありません</p>
          </section>
        ) : (
          <div className="space-y-4">
            {viewData.map((step) => (
              <section
                key={step.id}
                className="rounded-[1.618rem] border border-gray-800 bg-gray-950/55 px-4 py-4"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-[1.32rem] font-semibold tracking-tight">{step.name}</h2>
                  <span className="shrink-0 rounded-full border border-gray-700 px-2.5 py-1 text-[0.72rem] text-gray-300">
                    {step.progressPct}%
                  </span>
                </div>

                {step.categories.length === 0 ? (
                  <p className="text-sm text-gray-400">このStepにカテゴリがありません</p>
                ) : (
                  <div className="space-y-3">
                    {step.categories.map((cat) => {
                      const isOpen = !!openCats[cat.id];

                      return (
                        <div
                          key={cat.id}
                          className="rounded-[1.272rem] border border-gray-800/90 bg-gray-900/45 px-4 py-4"
                        >
                          <button
                            type="button"
                            onClick={() => toggleCat(cat.id)}
                            className="flex w-full items-center justify-between gap-3 text-left"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <h3 className="truncate text-[1.02rem] font-semibold">{cat.name}</h3>
                              <span className="rounded-full border border-gray-700 px-2.5 py-1 text-[0.72rem] text-gray-300">
                                {cat.progressPct}%
                              </span>
                            </div>
                            <span className="text-sm text-gray-400">{isOpen ? "▲" : "▼"}</span>
                          </button>

                          {isOpen && (
                            <div className="mt-4">
                              {cat.items.length === 0 ? (
                                <p className="text-sm text-gray-400">このカテゴリに項目がありません</p>
                              ) : (
                                <ul className="space-y-3">
                                  {cat.items.map((it) => {
                                    const rating = it.status?.rating ?? null;

                                    return (
                                      <li
                                        key={it.id}
                                        className="rounded-[1rem] border border-gray-800 bg-black/25 px-4 py-4"
                                      >
                                        <button
                                          type="button"
                                          onClick={() => openVideo(it.title, it.video_url)}
                                          className="w-full text-left"
                                        >
                                          <div className="text-[0.98rem] leading-[1.65] font-medium whitespace-pre-wrap underline underline-offset-4 decoration-gray-600">
                                            {it.title}
                                          </div>

                                          <p
                                            className={`mt-1 text-xs ${
                                              it.video_url ? "text-gray-500" : "text-gray-700"
                                            }`}
                                          >
                                            {it.video_url ? "動画あり" : "動画なし"}
                                          </p>
                                        </button>

                                        <div className="mt-3 flex items-center justify-between gap-3">
                                          {rating ? (
                                            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white text-sm font-bold text-white">
                                              {rating}
                                            </span>
                                          ) : null}

                                          <div className="flex flex-wrap justify-end gap-2">
                                            {(["S", "A", "B", "C"] as const).map((value) => (
                                              <button
                                                key={value}
                                                disabled={!canEdit}
                                                onClick={() => setRating(it.id, value)}
                                                className={`rounded-2xl px-3 py-2 text-sm font-medium transition active:scale-[0.98] ${
                                                  rating === value
                                                    ? "bg-green-600 text-white hover:bg-green-500"
                                                    : "bg-gray-800 text-white hover:bg-gray-700"
                                                } ${!canEdit ? "cursor-not-allowed opacity-50" : ""}`}
                                              >
                                                {value}
                                              </button>
                                            ))}
                                            <button
                                              disabled={!canEdit}
                                              onClick={() => setRating(it.id, null)}
                                              className={`rounded-2xl px-3 py-2 text-sm font-medium transition active:scale-[0.98] ${
                                                rating == null
                                                  ? "bg-gray-600 text-white hover:bg-gray-500"
                                                  : "bg-gray-800 text-white hover:bg-gray-700"
                                              } ${!canEdit ? "cursor-not-allowed opacity-50" : ""}`}
                                            >
                                              reset
                                            </button>
                                          </div>
                                        </div>

                                        {it.status?.cleared_at ? (
                                          <p className="mt-2 text-xs leading-5 text-gray-500">
                                            Last update: {it.actorName ?? "Unknown"} /{" "}
                                            {formatJaDateTime(it.status.cleared_at)}
                                          </p>
                                        ) : (
                                          <p className="mt-2 text-xs text-gray-600">Last update: -</p>
                                        )}
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

        {showVideo && (
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/72 p-3 sm:items-center sm:p-4"
            onClick={() => setShowVideo(false)}
          >
            <div
              className="w-full max-w-md rounded-t-[1.618rem] border border-gray-800 bg-gray-950 p-5 shadow-2xl sm:max-w-2xl sm:rounded-[1.618rem]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="line-clamp-2 text-lg font-semibold">{videoTitle || "動画"}</h2>
                <button
                  onClick={() => setShowVideo(false)}
                  className="rounded-xl bg-gray-800 px-3 py-1.5 text-sm"
                >
                  ×
                </button>
              </div>

              <div className="mt-4">
                {videoEmbedUrl ? (
                  <div className="overflow-hidden rounded-2xl border border-gray-800 bg-black">
                    <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
                      <iframe
                        className="absolute inset-0 h-full w-full"
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

              <button
                onClick={() => setShowVideo(false)}
                className="mt-4 w-full rounded-2xl bg-gray-700 px-4 py-3 text-sm font-medium"
              >
                閉じる
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
