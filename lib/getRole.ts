import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export type AppRole = "student" | "instructor" | "admin";

type RoleRow = { role: AppRole };

export async function getMyRoleOrThrow(): Promise<{ user: User; role: AppRole }> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw new Error(userErr.message);
  if (!userData.user) throw new Error("未ログインです");

  const user = userData.user;

  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle<RoleRow>();

  if (profErr) throw new Error(profErr.message);

  const role: AppRole = prof?.role ?? "student";
  return { user, role };
}