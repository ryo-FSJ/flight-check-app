"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AppRole = "student" | "instructor" | "admin" | null;

type StepRow = { id: string; name: string; sort_order: number | null };
type CategoryRow = { id: string; step_id: string; name: string; sort_order: number | null };
type CheckItemRow = { id: string; category_id: string; title: string; sort_order: number | null };

type UserItemCheckRow = {
  item_id: string;
  user_id: string; // 生徒
  is_cleared: boolean;
  cleared_at: string | null;
  cleared_by: string | null; // 更新した人（instructor/admin）
};

type ProfileRow = {
  user_id: string;
  name_romaji: string | null;
  role?: AppRole;
};

type ViewItem = CheckItemRow & {
  status?: UserItemCheckRow;
  actorName?: string;
};

type ViewCategory = CategoryRow & { items: ViewItem[] };
type ViewStep = StepRow & { categories: ViewCategory[] };

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

  // 生徒の表示名
  const [studentNameRomaji, setStudentNameRomaji] = useState<string>("");

  const [steps, setSteps] = useState<StepRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [items, setItems] = useState<CheckItemRow[]>([]);
  const [checks, setChecks] = useState<UserItemCheckRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]); // cleared_by の表示名用

  // ✅ 追加：カテゴリ開閉状態
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});

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

      // 1) ログインチェック
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

      // 2) 自分のrole取得
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

      // instructor/admin以外は入れない
      if (!(role === "instructor" || role === "admin")) {
        router.replace("/dashboard");
        return;
      }

      // 3) 生徒の name_romaji を取得（ヘッダー用）
      const { data: stProf, error: stErr } = await supabase
        .from("profiles")
        .select("user_id,name_romaji")
        .eq("user_id", studentId)
        .maybeSingle<ProfileRow>();

      if (stErr) {
        setStudentNameRomaji("");
      } else {
        setStudentNameRomaji((stProf?.name_romaji ?? "").trim());
      }

      // 4) データ取得（ターゲット = studentId）
      const [stepsRes, categoriesRes, itemsRes, checksRes] = await Promise.all([
        supabase.from("steps").select("id,name,sort_order").order("sort_order", { ascending: true }),
        supabase.from("categories").select("id,step_id,name,sort_order").order("sort_order", { ascending: true }),
        supabase.from("check_items").select("id,category_id,title,sort_order").order("sort_order", { ascending: true }),
        supabase
          .from("user_item_checks")
          .select("item_id,user_id,is_cleared,cleared_at,cleared_by")
          .eq("user_id", studentId),
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

      // 5) cleared_by のユーザー名を引く（重複除去してまとめて取得）
      const actorIds = Array.from(
        new Set(checksData.map((c) => c.cleared_by).filter((v): v is string => typeof v === "string" && v.length > 0))
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
      const list = categoriesByStep.get(cat.step_id) ?? [];
      list.push({ ...cat, items: itemsByCategory.get(cat.id) ?? [] });
      categoriesByStep.set(cat.step_id, list);
    }

    return steps.map((st) => ({ ...st, categories: categoriesByStep.get(st.id) ?? [] }));
  }, [steps, categories, items, checks, actorMap]);

  // ✅ 追加：カテゴリ開閉の切り替え
  const toggleCat = (catId: string) => {
    setOpenCats((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

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
      user_id: studentId,
      item_id: itemId,
      is_cleared: nextCleared,
      cleared_at: new Date().toISOString(),
      cleared_by: instructorId,
    };

    // Optimistic
    setChecks((prev) => {
      const exists = prev.find((c) => c.item_id === itemId && c.user_id === studentId);
      if (exists) {
        return prev.map((c) => (c.item_id === itemId && c.user_id === studentId ? { ...c, ...nextRow } : c));
      }
      return [...prev, nextRow];
    });

    const { data, error } = await supabase
      .from("user_item_checks")
      .upsert(nextRow, { onConflict: "user_id,item_id" })
      .select("item_id,user_id,is_cleared,cleared_at,cleared_by")
      .single();

    if (error) {
      setChecks(prevChecks);
      setErrorMsg(error.message);
      return;
    }

    if (data) {
      const row = data as UserItemCheckRow;
      setChecks((prev) => prev.map((c) => (c.item_id === row.item_id && c.user_id === row.user_id ? row : c)));

      if (row.cleared_by && !actorMap.has(row.cleared_by)) {
        const { data: p } = await supabase
          .from("profiles")
          .select("user_id,name_romaji")
          .eq("user_id", row.cleared_by)
          .maybeSingle<ProfileRow>();

        if (p?.user_id) setProfiles((prev) => [...prev, p]);
      }
    }
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
          onClick={() => router.replace("/instructor")}
          className="mt-4 w-full px-4 py-3 bg-gray-700 rounded-xl"
        >
          インストラクターホームへ
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-black text-white p-4">
      {/* ヘッダー（スマホ向け） */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Student Dashboard</h1>
          <div className="text-sm text-gray-400 flex flex-wrap gap-x-3 gap-y-1">
            <span className="break-all">studentId: {studentId}</span>
            {studentNameRomaji ? <span>name: {studentNameRomaji}</span> : <span className="text-gray-600">name: -</span>}
          </div>
        </div>

        <button
          onClick={() => router.replace("/instructor")}
          className="w-full sm:w-auto px-4 py-2.5 bg-gray-700 rounded-xl"
        >
          戻る
        </button>
      </div>

      {/* 本体（カテゴリをタップで開閉） */}
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
                      {/* ✅ カテゴリ名をボタン化（タップで開閉） */}
                      <button
                        type="button"
                        onClick={() => toggleCat(cat.id)}
                        className="w-full flex items-center justify-between gap-3 text-left"
                      >
                        <h3 className="text-lg font-semibold">{cat.name}</h3>
                        <span className="text-sm text-gray-400">{isOpen ? "▲" : "▼"}</span>
                      </button>

                      {/* ✅ 開いてる時だけ items を表示 */}
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
                                    <div className="text-base leading-relaxed font-medium whitespace-pre-wrap">
                                      {it.title}
                                    </div>

                                    <div className="mt-2 flex items-center justify-between gap-2">
                                      <span
                                        className={`text-sm px-3 py-1.5 rounded-lg border ${
                                          cleared ? "text-green-400 border-green-600" : "text-gray-300 border-gray-600"
                                        }`}
                                      >
                                        {cleared ? "✅ クリア" : "⬜ 未クリア"}
                                      </span>

                                      <button
                                        disabled={!canEdit}
                                        onClick={() => toggleClear(it.id, !cleared)}
                                        className={`px-4 py-2 rounded-xl text-sm font-semibold ${
                                          cleared ? "bg-gray-800" : "bg-blue-600"
                                        } ${!canEdit ? "opacity-50 cursor-not-allowed" : ""}`}
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