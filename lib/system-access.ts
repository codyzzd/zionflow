import type { User } from "@/types/domain";

import { slugify } from "@/lib/utils";

const SYSTEM_ADMIN_ALIASES = new Set(["codyzzd"]);

export function isSystemAdmin(user?: Pick<User, "email" | "name">) {
  if (!user) return false;

  const name = slugify(user.name);
  const emailLocalPart = slugify(user.email.split("@")[0] ?? "");

  return SYSTEM_ADMIN_ALIASES.has(name) || SYSTEM_ADMIN_ALIASES.has(emailLocalPart);
}
