import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  userId: string;
  email: string | null;
  roles: string[];
};

type UserRoleRow = {
  roles: { name: string } | { name: string }[] | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  const roles = ((data ?? []) as UserRoleRow[]).flatMap((row) => {
    const r = row.roles;
    if (!r) return [];
    return Array.isArray(r) ? r.map((x) => x.name) : [r.name];
  });

  return { userId: user.id, email: user.email ?? null, roles };
}

/**
 * Server Component guard: usar al inicio de un layout/page que
 * requiera uno de los roles indicados. Redirige a /login si no hay
 * sesión, o a /no-autorizado si el usuario no tiene ninguno de los
 * roles permitidos.
 */
export async function requireRole(allowed: string[]): Promise<CurrentUser> {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (!current.roles.some((r) => allowed.includes(r))) redirect("/no-autorizado");
  return current;
}

/**
 * Para Server Actions: la página/layout que las expone ya hizo
 * requireRole(); esto solo obtiene el uid autenticado para pasarlo
 * como "actor" a la capa de servicio. Lanza si por algún motivo no hay
 * sesión (defensa en profundidad — RLS igual bloquearía el write).
 */
export async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  return user.id;
}
