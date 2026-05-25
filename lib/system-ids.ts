export const SYSTEM_ROLE_IDS = {
  stakeAdmin: "00000000-0000-4000-8000-000000000101",
  wardAdmin: "00000000-0000-4000-8000-000000000102",
  viewer: "00000000-0000-4000-8000-000000000103",
} as const;

const SYSTEM_ROLE_ID_SET = new Set<string>(Object.values(SYSTEM_ROLE_IDS));
const LEGACY_SYSTEM_ROLE_IDS = ["role_admin", "role_bishopric", "role_viewer"];

export function isSystemRoleId(roleId: string) {
  return SYSTEM_ROLE_ID_SET.has(roleId) || LEGACY_SYSTEM_ROLE_IDS.includes(roleId);
}

export const DEFAULT_HYMN_BOOK_IDS = {
  old: "00000000-0000-4000-8000-000000000201",
  new: "00000000-0000-4000-8000-000000000202",
  primary: "00000000-0000-4000-8000-000000000203",
} as const;
