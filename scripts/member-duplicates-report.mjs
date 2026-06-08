#!/usr/bin/env node

import fs from "node:fs";

const envPath = ".env.local";
const env = fs.existsSync(envPath)
  ? Object.fromEntries(
      fs
        .readFileSync(envPath, "utf8")
        .split(/\n/)
        .filter(Boolean)
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    )
  : process.env;

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const wardId = process.argv.find((arg) => arg.startsWith("--ward-id="))?.replace("--ward-id=", "");

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  process.exit(1);
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function strongIdentity(member) {
  const nameKey = slugify(member.data?.name);
  const birthDate = member.data?.birthDate;
  const memberWardId = member.ward_id ?? member.data?.wardId;

  return memberWardId && nameKey && birthDate ? `${memberWardId}::${nameKey}::${birthDate}` : "";
}

async function selectAll(table, params = {}) {
  const rows = [];

  for (let from = 0; ; from += 500) {
    const url = new URL(`/rest/v1/${table}`, supabaseUrl);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    url.searchParams.set("limit", "500");
    url.searchParams.set("offset", String(from));

    const response = await fetch(url, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`${table}: ${response.status} ${text}`);
    }

    const page = JSON.parse(text);
    rows.push(...page);

    if (page.length < 500) return rows;
  }
}

function memberCompleteness(member) {
  const data = member.data ?? {};
  return ["phone", "address", "birthDate", "latitude", "longitude", "observation"].reduce((score, key) => score + (data[key] ? 1 : 0), 0);
}

function chooseKeeper(group) {
  return [...group].sort((a, b) => {
    const activeDelta = Number(Boolean(a.data?.archivedAt)) - Number(Boolean(b.data?.archivedAt));
    if (activeDelta !== 0) return activeDelta;

    const completenessDelta = memberCompleteness(b) - memberCompleteness(a);
    if (completenessDelta !== 0) return completenessDelta;

    return String(a.data?.createdAt ?? a.created_at ?? "").localeCompare(String(b.data?.createdAt ?? b.created_at ?? ""));
  })[0];
}

function countReferences(memberId, referenceRows) {
  return referenceRows.reduce((count, row) => count + (row.member_id === memberId || row.host_member_id === memberId || row.data?.memberId === memberId || row.data?.hostMemberId === memberId ? 1 : 0), 0);
}

async function main() {
  const memberParams = {
    select: "id,ward_id,data,created_at,updated_at",
  };
  if (wardId) memberParams.ward_id = `eq.${wardId}`;

  const [members, attendance, notes, users, hostHouses, lunchSchedules, patrolMembers] = await Promise.all([
    selectAll("members", memberParams),
    selectAll("member_attendance_records", { select: "id,member_id,data" }).catch(() => []),
    selectAll("member_notes", { select: "id,member_id,data" }).catch(() => []),
    selectAll("users", { select: "id,member_id,data" }).catch(() => []),
    selectAll("host_houses", { select: "id,host_member_id,data" }).catch(() => []),
    selectAll("lunch_schedules", { select: "id,host_member_id,data" }).catch(() => []),
    selectAll("patrol_members", { select: "id,member_id,data" }).catch(() => []),
  ]);
  const referenceRows = [...attendance, ...notes, ...users, ...hostHouses, ...lunchSchedules, ...patrolMembers];
  const groups = new Map();

  members.forEach((member) => {
    const key = strongIdentity(member);
    if (!key) return;
    groups.set(key, [...(groups.get(key) ?? []), member]);
  });

  const duplicates = [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => {
      const keeper = chooseKeeper(group);

      return {
        key,
        name: keeper.data?.name,
        birthDate: keeper.data?.birthDate,
        wardId: keeper.ward_id ?? keeper.data?.wardId,
        keepId: keeper.id,
        duplicateIds: group.filter((member) => member.id !== keeper.id).map((member) => member.id),
        members: group.map((member) => ({
          id: member.id,
          active: !member.data?.archivedAt,
          createdAt: member.data?.createdAt ?? member.created_at,
          updatedAt: member.data?.updatedAt ?? member.updated_at,
          referenceCount: countReferences(member.id, referenceRows),
        })),
      };
    });

  console.log(JSON.stringify({ duplicateGroupCount: duplicates.length, duplicates }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
