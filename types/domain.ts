export type PermissionKey =
  | "dashboard.view"
  | "users.manage"
  | "roles.manage"
  | "members.view"
  | "members.manage"
  | "minutes.view"
  | "minutes.manage"
  | "missionary.view"
  | "missionary.manage"
  | "patrol.view"
  | "patrol.manage"
  | "reports.view"
  | "exports.run"
  | "audit.view";

export type UserStatus = "active" | "inactive";
export type MinuteStatus = "draft" | "published";
export type LunchStatus = "pending" | "confirmed" | "cancelled";
export type ConfirmationStatus = "not_viewed" | "viewed" | "accepted" | "declined";
export type PatrolStatus = "scheduled" | "confirmed" | "done" | "missed";
export type MissionaryType = "elders" | "sisters";
export type CalendarWeekStartsOn = "sunday" | "monday";

export const MEMBER_ORGANIZATION_OPTIONS = [
  "Quorum de Elderes",
  "Sociedade de Socorro",
  "Rapazes e Moças",
  "Jovens Adultos Solteiros",
] as const;

export interface Stake {
  id: string;
  name: string;
}

export interface Ward {
  id: string;
  stakeId: string;
  name: string;
  city: string;
  state: string;
  meetingTime: string;
  bishopric: string[];
  summary: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: PermissionKey[];
}

export interface User {
  id: string;
  wardId: string;
  memberId?: string;
  name: string;
  email: string;
  phone: string;
  status: UserStatus;
  roleId: string;
  permissionOverrides: PermissionKey[];
  createdAt: string;
  lastAccessAt?: string;
}

export interface MemberNote {
  id: string;
  memberId: string;
  createdAt: string;
  createdBy: string;
  text: string;
}

export interface Member {
  id: string;
  wardId: string;
  name: string;
  birthDate: string;
  organization: string;
  sex: "M" | "F";
  sacramentTalkDuration: "5" | "10" | "15";
  canSpeak: boolean;
  canPreside: boolean;
  canConduct: boolean;
}

export interface HybridField {
  mode: "linked" | "manual";
  linkedId?: string;
  manualValue?: string;
}

export interface MinuteFormData {
  presiding: HybridField;
  conducting: HybridField;
  recognitions: string;
  announcements: string;
  attendance: number;
  conductor: HybridField;
  accompanist: HybridField;
  openingHymn: HybridField;
  openingPrayer: HybridField;
  releases: string;
  sustainings: string;
  priesthoodAdvancements: string;
  certificates: string;
  confirmations: string;
  childBlessings: string;
  sacramentHymn: HybridField;
  speaker1: HybridField;
  speaker2: HybridField;
  intermediateHymn: HybridField;
  speaker3: HybridField;
  closingHymn: HybridField;
  closingPrayer: HybridField;
  notes: string;
}

export interface SacramentMinuteVersion {
  id: string;
  minuteId: string;
  createdAt: string;
  createdBy: string;
  snapshot: MinuteFormData;
  status: MinuteStatus;
}

export interface SacramentMinute {
  id: string;
  wardId: string;
  title: string;
  date: string;
  status: MinuteStatus;
  presidency: string;
  responsibleUserId: string;
  form: MinuteFormData;
  createdAt: string;
  updatedAt: string;
  versionIds: string[];
}

export interface Hymn {
  id: string;
  number: string;
  title: string;
}

export interface MissionaryCompanionship {
  id: string;
  wardId: string;
  name: string;
  type: MissionaryType;
  area: string;
  members: string[];
  status: "active" | "inactive";
}

export interface HostHouse {
  id: string;
  wardId: string;
  hostMemberId?: string;
  familyName: string;
  address: string;
  phone: string;
  capacity: number;
  notes: string;
  preferredAvailability: string;
}

export interface LunchSchedule {
  id: string;
  wardId: string;
  date: string;
  time: string;
  companionshipIds: string[];
  hostMemberId: string;
  notes: string;
  status: LunchStatus;
  confirmationStatus: ConfirmationStatus;
}

export interface PatrolMember {
  id: string;
  wardId: string;
  memberId?: string;
  name: string;
  phone: string;
  notes: string;
  active: boolean;
}

export interface PatrolSchedule {
  id: string;
  wardId: string;
  date: string;
  sacramentalMemberIds: string[];
  classMemberIds: string[];
  notes: string;
  status: PatrolStatus;
  confirmationStatus: ConfirmationStatus;
  startTime?: string;
  endTime?: string;
  primaryPatrolMemberId?: string;
  secondaryPatrolMemberId?: string;
  originalPrimaryPatrolMemberId?: string;
}

export interface AuditLog {
  id: string;
  wardId: string;
  createdAt: string;
  actorUserId: string;
  action: string;
  module: string;
  itemLabel: string;
  summary: string;
}

export interface SessionState {
  currentUserId?: string;
  currentWardId?: string;
}

export interface AppPreferences {
  calendarWeekStartsOn: CalendarWeekStartsOn;
}

export interface Database {
  stakes: Stake[];
  wards: Ward[];
  roles: Role[];
  users: User[];
  members: Member[];
  memberNotes: MemberNote[];
  sacramentMinutes: SacramentMinute[];
  minuteVersions: SacramentMinuteVersion[];
  hymns: Hymn[];
  missionaryCompanionships: MissionaryCompanionship[];
  hostHouses: HostHouse[];
  lunchSchedules: LunchSchedule[];
  patrolMembers: PatrolMember[];
  patrolSchedules: PatrolSchedule[];
  auditLogs: AuditLog[];
  appPreferences: AppPreferences;
  session: SessionState;
}
