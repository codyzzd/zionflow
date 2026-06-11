import type { User } from "@/types/domain";

const SYSTEM_SUPER_USER_EMAIL = "codyzzd@gmail.com";

export function isSystemAdmin(user?: Pick<User, "accountType" | "email">) {
  return user?.accountType === "system_super_user" || user?.email.trim().toLowerCase() === SYSTEM_SUPER_USER_EMAIL;
}
