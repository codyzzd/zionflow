import type { User } from "@/types/domain";

export function isSystemAdmin(user?: Pick<User, "accountType">) {
  return user?.accountType === "system_super_user";
}
