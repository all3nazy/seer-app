import { cache } from "react";
import { requestSession } from "./supabase/server";
import { isAdminRole, roleAllows, rolesForPath, type AdminRole } from "./admin-roles";

/**
 * The signed-in admin's role (server only), once per request. Before the stage 3 migration is
 * applied the function does not exist yet and every admin is an owner, so that is the fallback; the
 * database still checks the role on every call.
 */
export const currentAdminRole = cache(async (): Promise<AdminRole> => {
  const { client } = await requestSession();
  const { data, error } = await client.rpc("my_platform_role");
  if (error) return "owner";
  return isAdminRole(data) ? data : "owner";
});

/** True when the current role may open this console path. */
export async function mayOpen(path: string): Promise<boolean> {
  return roleAllows(await currentAdminRole(), rolesForPath(path));
}
