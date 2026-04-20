"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";
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
  role: AppRole;
  name_romaji: string | null;
};

type StudentProfileRow = {
  id: string;
  owner_user_id: string;
  name_romaji: string;
  sort_order: number;
  created_at?: string;
};

type ViewItem = CheckItemRow & { status?: UserItemCheckRow };
type ViewCategory = CategoryRow & { items: ViewItem[]; progressPct: number };
type ViewStep = StepRow & { categories: ViewCategory[]; progressPct: number };

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

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [myRole, setMyRole] = useState<AppRole>(null);
  const [myNameRomaji, setMyNameRomaji] = useState("");

  const [ownerUserId, setOwnerUserId] = useState("");
  const [students, setStudents] = useState<StudentProfileRow[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");

  const [steps, setSteps] = useState<StepRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [items, setItems] = useState<CheckItemRow[]>([]);
  const [checks, setChecks] = useState<UserItemCheckRow[]>([]);

  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [showMenu, setShowMenu] = useState(false);

  const [showQr, setShowQr] = useState(false);
  const [copyMsg, setCopyMsg] = useState("");

  const [showVideo, setShowVideo] = useState(false);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoEmbedUrl, setVideoEmbedUrl] = useState<string | null>(null);
  const [videoMsg, setVideoMsg] = useState("");

  const [showStudentSwitcher, setShowStudentSwitcher] = useState(false);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentInviteCode, setNewStudentInviteCode] = useState("");
  const [addStudentMsg, setAddStudentMsg] = useState("");
  const [addingStudent, setAddingStudent] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) ?? null,
    [students, selectedStudentId]
  );

  const toggleCat = (catId: string) =>
    setOpenCats((prev) => ({ ...prev, [catId]: !prev[catId] }));

  const closeMenu = () => setShowMenu(false);

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
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    const fail = (msg: string) => {
      setErrorMsg(msg);
      setLoading(false);
    };

    const init = async () => {
      setLoading(true);
      setErrorMsg("");

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) return fail(userErr.message);

      if (!userData.user) {
        router.replace("/login");
        return;
      }

      const userId = userData.user.id;
      setOwnerUserId(userId);

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("user_id,role,name_romaji")
        .eq("user_id", userId)
        .maybeSingle<ProfileRow>();

      if (profErr) return fail(profErr.message);

      const role = (prof?.role ?? "student") as AppRole;
      setMyRole(role);
      setMyNameRomaji((prof?.name_romaji ?? "").trim());

      if (role === "instructor" || role === "admin") {
        router.replace("/instructor");
        return;
      }

      const [studentsRes, stepsRes, categoriesRes, itemsRes] = await Promise.all([
        supabase
          .from("student_profiles")
          .select("id,owner_user_id,name_romaji,sort_order,created_at")
          .eq("owner_user_id", userId)
          .order("sort_order", { ascending: true }),
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
      ]);

      if (studentsRes.error) return fail(studentsRes.error.message);
      if (stepsRes.error) return fail(stepsRes.error.message);
      if (categoriesRes.error) return fail(categoriesRes.error.message);
      if (itemsRes.error) return fail(itemsRes.error.message);

      const studentList = (studentsRes.data ?? []) as StudentProfileRow[];
      setStudents(studentList);

      const firstStudent = studentList[0];
      if (!firstStudent) return fail("student profile が見つかりません");

      setSelectedStudentId(firstStudent.id);
      setSteps((stepsRes.data ?? []) as StepRow[]);
      setCategories((categoriesRes.data ?? []) as CategoryRow[]);
      setItems((itemsRes.data ?? []) as CheckItemRow[]);

      setLoading(false);
    };

    init();
  }, [router]);

  useEffect(() => {
    if (!selectedStudentId) return;

    const loadChecks = async () => {
      const { data, error } = await supabase
        .from("user_item_checks")
        .select("item_id,user_id,student_profile_id,is_cleared,rating,cleared_at,cleared_by")
        .eq("student_profile_id", selectedStudentId);

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setChecks((data ?? []) as UserItemCheckRow[]);
    };

    loadChecks();
  }, [selectedStudentId]);

  useEffect(() => {
    if (!selectedStudentId) return;

    const channel = supabase
      .channel(`uic-student-${selectedStudentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_item_checks",
          filter: `student_profile_id=eq.${selectedStudentId}`,
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
  }, [selectedStudentId]);

  useEffect(() => {
    closeMenu();
  }, [selectedStudentId]);

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
      const cleared = its.filter((x) => x.status?.rating != null).length;
      const pct = total === 0 ? 0 : clampPct((cleared / total) * 100);

      const list = categoriesByStep.get(cat.step_id) ?? [];
      list.push({ ...cat, items: its, progressPct: pct });
      categoriesByStep.set(cat.step_id, list);
    }

    return steps.map((st) => {
      const stepCategories = categoriesByStep.get(st.id) ?? [];
      const totalItems = stepCategories.reduce((sum, c) => sum + c.items.length, 0);
      const totalCleared = stepCategories.reduce(
        (sum, c) => sum + c.items.filter((x) => x.status?.rating != null).length,
        0
      );

      return {
        ...st,
        categories: stepCategories,
        progressPct: totalItems === 0 ? 0 : clampPct((totalCleared / totalItems) * 100),
      };
    });
  }, [steps, categories, items, checks]);

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

  const qrUrl = useMemo(() => {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    return selectedStudentId
      ? `${origin}/instructor/student/${encodeURIComponent(selectedStudentId)}`
      : `${origin}/instructor`;
  }, [selectedStudentId]);

  const copyQrUrl = async () => {
    setCopyMsg("");
    try {
      await navigator.clipboard.writeText(qrUrl);
      setCopyMsg("コピーしました ✅");
      window.setTimeout(() => setCopyMsg(""), 1600);
    } catch {
      setCopyMsg("コピーできませんでした");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const handleAddStudent = async () => {
    setAddStudentMsg("");

    const name = newStudentName.trim();
    const invite = newStudentInviteCode.trim();

    if (!ownerUserId) {
      setAddStudentMsg("ログイン情報が見つかりません");
      return;
    }
    if (!name) {
      setAddStudentMsg("student名を入力してね");
      return;
    }
    if (!invite) {
      setAddStudentMsg("招待コードを入力してね");
      return;
    }
    if (students.length >= 3) {
      setAddStudentMsg("student は最大3人までです");
      return;
    }

    setAddingStudent(true);

    try {
      const { data: isValid, error: validateErr } = await supabase.rpc(
        "validate_signup_invite_code",
        { p_code: invite }
      );

      if (validateErr) {
        setAddStudentMsg(validateErr.message);
        return;
      }

      if (!isValid) {
        setAddStudentMsg("招待コードが正しくありません");
        return;
      }

      const nextSortOrder =
        students.length === 0
          ? 1
          : Math.max(...students.map((s) => s.sort_order)) + 1;

      const { data: inserted, error: insertErr } = await supabase
        .from("student_profiles")
        .insert({
          owner_user_id: ownerUserId,
          name_romaji: name,
          sort_order: nextSortOrder,
        })
        .select("id,owner_user_id,name_romaji,sort_order,created_at")
        .single<StudentProfileRow>();

      if (insertErr) {
        setAddStudentMsg(insertErr.message);
        return;
      }

      if (inserted) {
        const nextStudents = [...students, inserted].sort(
          (a, b) => a.sort_order - b.sort_order
        );
        setStudents(nextStudents);
        setSelectedStudentId(inserted.id);
        setNewStudentName("");
        setNewStudentInviteCode("");
        setShowAddStudent(false);
      }
    } finally {
      setAddingStudent(false);
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
            onClick={() => router.replace("/login")}
            className="mt-4 w-full rounded-2xl bg-gray-800 px-4 py-3 text-sm font-medium"
          >
            ログインへ
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
                  Flight Check
                </p>
                <h1 className="text-[2rem] leading-none font-bold tracking-tight">Dashboard</h1>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[0.78rem] text-gray-400">
                <span className="rounded-full border border-gray-800 bg-gray-900/70 px-2.5 py-1">
                  owner: {myNameRomaji || "-"}
                </span>
                <span className="rounded-full border border-gray-800 bg-gray-900/70 px-2.5 py-1">
                  student: {selectedStudent?.name_romaji ?? "-"}
                </span>
                <span className="rounded-full border border-indigo-900/70 bg-indigo-950/40 px-2.5 py-1 text-indigo-200">
                  progress: {totalProgressPct}%
                </span>
              </div>

              {students.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {students.map((student) => {
                    const active = student.id === selectedStudentId;
                    return (
                      <button
                        key={student.id}
                        type="button"
                        onClick={() => setSelectedStudentId(student.id)}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          active
                            ? "border-indigo-500 bg-indigo-500/15 text-white"
                            : "border-gray-800 bg-gray-900/60 text-gray-300"
                        }`}
                      >
                        {student.name_romaji}
                      </button>
                    );
                  })}
                </div>
              )}

              {videoMsg && (
                <p className="rounded-2xl border border-yellow-800/60 bg-yellow-950/20 px-3 py-2 text-xs text-yellow-300">
                  {videoMsg}
                </p>
              )}
            </div>

            <div ref={menuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowMenu((prev) => !prev)}
                className={`flex h-10 w-10 items-center justify-center rounded-xl border text-white transition active:scale-95 ${
                  showMenu
                    ? "border-indigo-500 bg-indigo-500/12 shadow-[0_0_0_1px_rgba(99,102,241,0.2)]"
                    : "border-gray-700/80 bg-gray-900/80 hover:bg-gray-800"
                }`}
                aria-label="メニューを開く"
                aria-expanded={showMenu}
                aria-haspopup="menu"
              >
                <span className="text-lg leading-none">☰</span>
              </button>

              {showMenu && (
                <div className="absolute right-0 top-12 z-50 w-52 overflow-hidden rounded-2xl border border-gray-800 bg-gray-950/95 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur">
                  <button
                    onClick={() => {
                      closeMenu();
                      setShowStudentSwitcher(true);
                    }}
                    className="w-full border-b border-gray-800 px-4 py-3 text-left text-sm text-white transition hover:bg-gray-900"
                  >
                    アカウント切り替え
                  </button>

                  <button
                    onClick={() => {
                      closeMenu();
                      setShowAddStudent(true);
                    }}
                    className="w-full border-b border-gray-800 px-4 py-3 text-left text-sm text-white transition hover:bg-gray-900"
                  >
                    ＋アカウント追加
                  </button>

                  <button
                    onClick={() => {
                      closeMenu();
                      setShowQr(true);
                    }}
                    className="w-full border-b border-gray-800 px-4 py-3 text-left text-sm text-white transition hover:bg-gray-900"
                  >
                    QRを表示
                  </button>

                  <button
                    onClick={() => {
                      closeMenu();
                      void handleLogout();
                    }}
                    className="w-full px-4 py-3 text-left text-sm text-red-400 transition hover:bg-gray-900"
                  >
                    ログアウト
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {viewData.length === 0 ? (
          <section className="rounded-[1.618rem] border border-gray-800 bg-gray-950/55 px-4 py-5">
            <p className="text-sm text-gray-300">データがありません（steps が空かも）</p>
          </section>
        ) : (
          <div className="space-y-4">
            {viewData.map((step) => (
              <section
                key={step.id}
                className="rounded-[1.618rem] border border-gray-800 bg-gray-950/55 px-4 py-4"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[1.32rem] font-semibold tracking-tight">{step.name}</h2>
                  </div>
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

                                          <span
                                            className={`text-right text-xs ${
                                              rating ? "text-gray-500" : "text-gray-600"
                                            }`}
                                          >
                                            {formatJaDateTime(it.status?.cleared_at)}
                                          </span>
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

        {showStudentSwitcher && (
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/72 p-3 sm:items-center sm:p-4"
            onClick={() => setShowStudentSwitcher(false)}
          >
            <div
              className="w-full max-w-md rounded-t-[1.618rem] border border-gray-800 bg-gray-950 p-5 shadow-2xl sm:rounded-[1.618rem]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">アカウント切り替え</h2>
                <button
                  onClick={() => setShowStudentSwitcher(false)}
                  className="rounded-xl bg-gray-800 px-3 py-1.5 text-sm"
                >
                  ×
                </button>
              </div>

              <div className="space-y-2">
                {students.map((student) => {
                  const active = student.id === selectedStudentId;

                  return (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => {
                        setSelectedStudentId(student.id);
                        setShowStudentSwitcher(false);
                      }}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        active
                          ? "border-indigo-500 bg-indigo-500/10 text-white"
                          : "border-gray-800 bg-gray-900/50 text-gray-200 hover:bg-gray-800"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{student.name_romaji}</span>
                        {active && <span className="text-xs text-indigo-300">現在表示中</span>}
                      </div>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => {
                  setShowStudentSwitcher(false);
                  setShowAddStudent(true);
                }}
                className="mt-4 w-full rounded-2xl bg-indigo-600 px-4 py-3 font-medium transition hover:bg-indigo-500"
              >
                ＋ studentを追加
              </button>
            </div>
          </div>
        )}

        {showAddStudent && (
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/72 p-3 sm:items-center sm:p-4"
            onClick={() => setShowAddStudent(false)}
          >
            <div
              className="w-full max-w-md rounded-t-[1.618rem] border border-gray-800 bg-gray-950 p-5 shadow-2xl sm:rounded-[1.618rem]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">student追加</h2>
                <button
                  onClick={() => setShowAddStudent(false)}
                  className="rounded-xl bg-gray-800 px-3 py-1.5 text-sm"
                >
                  ×
                </button>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="student名（例: jiro）"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  className="w-full rounded-2xl bg-gray-900 px-4 py-3 text-white outline-none ring-1 ring-gray-800 placeholder:text-gray-500 focus:ring-indigo-500"
                />

                <input
                  type="password"
                  placeholder="招待コード"
                  value={newStudentInviteCode}
                  onChange={(e) => setNewStudentInviteCode(e.target.value)}
                  className="w-full rounded-2xl bg-gray-900 px-4 py-3 text-white outline-none ring-1 ring-gray-800 placeholder:text-gray-500 focus:ring-indigo-500"
                />

                <p className="text-xs text-gray-500">最大3人まで追加できます。</p>

                {addStudentMsg && (
                  <p className="rounded-2xl border border-yellow-800/60 bg-yellow-950/20 px-3 py-2 text-sm text-yellow-300">
                    {addStudentMsg}
                  </p>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setShowAddStudent(false)}
                  className="rounded-2xl bg-gray-800 px-4 py-3 text-sm font-medium"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleAddStudent}
                  disabled={addingStudent}
                  className="rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-medium transition disabled:opacity-50"
                >
                  {addingStudent ? "追加中..." : "追加する"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showQr && (
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/72 p-3 sm:items-center sm:p-4"
            onClick={() => setShowQr(false)}
          >
            <div
              className="w-full max-w-md rounded-t-[1.618rem] border border-gray-800 bg-gray-950 p-5 shadow-2xl sm:rounded-[1.618rem]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">
                  {selectedStudent?.name_romaji || "student"} のQR
                </h2>
                <button
                  onClick={() => setShowQr(false)}
                  className="rounded-xl bg-gray-800 px-3 py-1.5 text-sm"
                >
                  ×
                </button>
              </div>

              <div className="mt-3 space-y-2">
                <p className="break-all text-xs text-gray-400">{qrUrl}</p>

                <button
                  onClick={copyQrUrl}
                  className="w-full rounded-2xl bg-gray-800 px-4 py-2.5 text-sm font-medium"
                >
                  URLをコピー
                </button>

                {copyMsg && (
                  <p className="rounded-2xl border border-yellow-800/60 bg-yellow-950/20 px-3 py-2 text-xs text-yellow-300">
                    {copyMsg}
                  </p>
                )}
              </div>

              <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-4">
                <QRCodeCanvas value={qrUrl} size={236} />
              </div>

              <p className="mt-3 text-xs leading-5 text-gray-500">
                インストラクターがこのQRをスキャンすると、このstudentの進捗ページに移動します。
              </p>

              <button
                onClick={() => setShowQr(false)}
                className="mt-4 w-full rounded-2xl bg-gray-700 px-4 py-3 text-sm font-medium"
              >
                閉じる
              </button>
            </div>
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
