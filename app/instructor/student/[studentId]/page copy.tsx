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

type ViewCategory = CategoryRow & { items: ViewItem[]; progressPct: number };
type ViewStep = StepRow & { categories: ViewCategory[] };

function clampPct(n: number) {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
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

  const [studentNameRomaji, setStudentNameRomaji] = useState<string>("");
  const [studentOwnerUserId, setStudentOwnerUserId] = useState<string>("");

  const [steps, setSteps] = useState<StepRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [items, setItems] = useState<CheckItemRow[]>([]);
  const [checks, setChecks] = useState<UserItemCheckRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);

  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const toggleCat = (catId: string) => setOpenCats((prev) => ({ ...prev, [catId]: !prev[catId] }));

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
        !!userErr && typeof userErr.message === "string" && userErr.message.includes("Auth session missing");

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

      // 自分の role
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

      // student_profile 本体取得
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
        supabase.from("steps").select("id,name,sort_order").order("sort_order", { ascending: true }),
        supabase.from("categories").select("id,step_id,name,sort_order").order("sort_order", { ascending: true }),
        supabase
          .from("check_items")
          .select("id,category_id,title,sort_order,video_url")
          .order("sort_order", { ascending: true }),
        supabase
          .from("user_item_checks")
          .select("item_id,user_id,student_profile_id,is_cleared,cleared_at,cleared_by")
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

    init();
  }, [router, studentId]);

  // realtime
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
    const m = new Map<string, string>();
    for (const p of profiles) {
      m.set(p.user_id, p.name_romaji ?? "Unknown");
    }
    return m;
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
      const cleared = categoryItems.filter((x) => x.status?.is_cleared === true).length;
      const pct = total === 0 ? 0 : clampPct((cleared / total) * 100);

      const list = categoriesByStep.get(cat.step_id) ?? [];
      list.push({ ...cat, items: categoryItems, progressPct: pct });
      categoriesByStep.set(cat.step_id, list);
    }

    return steps.map((st) => ({ ...st, categories: categoriesByStep.get(st.id) ?? [] }));
  }, [steps, categories, items, checks, actorMap]);

  const toggleClear = async (itemId: string, nextCleared: boolean) => {
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

    const nextRow: UserItemCheckRow = {
      user_id: studentOwnerUserId,
      student_profile_id: studentId,
      item_id: itemId,
      is_cleared: nextCleared,
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
      .select("item_id,user_id,student_profile_id,is_cleared,cleared_at,cleared_by")
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
      <main className="min-h-[100dvh] bg-black text-white px-4 py-5 sm:px-6 sm:py-6">
        <p>読み込み中...</p>
      </main>
    );
  }

  if (errorMsg) {
    return (
      <main className="min-h-[100dvh] bg-black text-white px-4 py-5 sm:px-6 sm:py-6">
        <p className="text-red-400">エラー: {errorMsg}</p>
        <button
          onClick={() => router.replace("/instructor")}
          className="mt-4 w-full rounded-2xl bg-gray-700 px-4 py-3"
        >
          インストラクターホームへ
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-black text-white px-4 py-5 sm:px-6 sm:py-6">
      <div className="mb-5 rounded-[1.618rem] border border-gray-800 bg-gray-950/70 px-4 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="space-y-1">
              <p className="text-[0.72rem] uppercase tracking-[0.22em] text-gray-500">
                Instructor View
              </p>
              <h1 className="text-[1.9rem] leading-none font-bold">Student Dashboard</h1>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-400">
              <span>student: {studentNameRomaji || "-"}</span>
              <span className="break-all">student_profile_id: {studentId}</span>
            </div>
          </div>

          <button
            onClick={() => router.replace("/instructor")}
            className="rounded-2xl bg-gray-700 px-4 py-2.5 text-sm font-medium transition hover:bg-gray-600"
          >
            戻る
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {viewData.map((step) => (
          <section
            key={step.id}
            className="rounded-[1.618rem] border border-gray-800 bg-gray-950/55 px-4 py-4"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-[1.35rem] font-semibold tracking-tight">{step.name}</h2>
            </div>

            {step.categories.length === 0 ? (
              <p className="text-gray-400">このStepにカテゴリがありません</p>
            ) : (
              <div className="space-y-4">
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
                          <h3 className="truncate text-[1.06rem] font-semibold">{cat.name}</h3>
                          <span className="rounded-full border border-gray-700 px-2.5 py-1 text-[0.72rem] text-gray-300">
                            {cat.progressPct}%
                          </span>
                        </div>
                        <span className="text-sm text-gray-400">{isOpen ? "▲" : "▼"}</span>
                      </button>

                      {isOpen && (
                        <div className="mt-4">
                          {cat.items.length === 0 ? (
                            <p className="text-gray-400">このカテゴリに項目がありません</p>
                          ) : (
                            <ul className="space-y-3">
                              {cat.items.map((it) => {
                                const cleared = it.status?.is_cleared === true;

                                return (
                                  <li
                                    key={it.id}
                                    className="rounded-[1rem] border border-gray-800 bg-black/25 px-4 py-4"
                                  >
                                    <div className="text-[1rem] leading-[1.62] font-medium whitespace-pre-wrap">
                                      {it.title}
                                    </div>

                                    <div className="mt-3 flex items-center justify-between gap-3">
                                      <span
                                        className={`rounded-full border px-3 py-1.5 text-sm ${
                                          cleared
                                            ? "border-green-600 text-green-400"
                                            : "border-gray-600 text-gray-300"
                                        }`}
                                      >
                                        {cleared ? "✅ クリア" : "⬜ 未クリア"}
                                      </span>

                                      <button
                                        disabled={!canEdit}
                                        onClick={() => toggleClear(it.id, !cleared)}
                                        className={`rounded-2xl px-4 py-2 text-sm font-medium ${
                                          cleared ? "bg-gray-800" : "bg-blue-600"
                                        } ${!canEdit ? "cursor-not-allowed opacity-50" : ""}`}
                                      >
                                        {cleared ? "未クリアに戻す" : "クリアにする"}
                                      </button>
                                    </div>

                                    {it.status?.cleared_at ? (
                                      <p className="mt-2 text-xs text-gray-500">
                                        Last update: {it.actorName ?? "Unknown"} /{" "}
                                        {new Date(it.status.cleared_at).toLocaleString()}
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
    </main>
  );
}