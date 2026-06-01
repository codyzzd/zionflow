export type PermissionKey =
  | "dashboard.view"
  | "ward.view"
  | "ward.manage"
  | "stake.view"
  | "stake.manage"
  | "users.view"
  | "users.manage"
  | "roles.manage"
  | "members.view"
  | "members.manage"
  | "minutes.view"
  | "minutes.manage"
  | "hymns.view"
  | "frequency.view"
  | "frequency.manage"
  | "missionary.view"
  | "missionary.manage"
  | "lunch.view"
  | "lunch.manage"
  | "caravan.view"
  | "caravan.manage"
  | "caravan.register.view"
  | "caravan.register.manage"
  | "caravan.approve.view"
  | "caravan.approve.manage"
  | "caravan.manage.view"
  | "caravan.manage.manage"
  | "patrol.view"
  | "patrol.manage"
  | "reports.view"
  | "exports.run"
  | "audit.view";

export type UserStatus = "active" | "inactive";
export type UserAccountType = "regular" | "system_super_user";
export type UserAccessLevel = "stake_owner" | "stake_leader" | "ward_owner" | "ward_leader" | "member";
export type StakeOwnerRequestStatus = "pending" | "approved" | "cancelled" | "invalidated";
export type MinuteStatus = "draft" | "published";
export type ConfirmationStatus = "not_viewed" | "viewed" | "accepted" | "declined";
export type PatrolStatus = "scheduled" | "confirmed" | "done" | "missed";
export type MissionaryType = "elders" | "sisters";
export type CaravanPersonType = "family" | "friends";
export type CaravanSeatMode = "quantity" | "vehicle";
export type Weekday = "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";
export type CalendarWeekStartsOn = "sunday" | "monday";
export type DateFormat = "short" | "medium" | "long";

export const MEMBER_ORGANIZATION_OPTIONS = [
  "Quorum de Elderes",
  "Sociedade de Socorro",
  "Rapazes e Moças",
  "Jovens Adultos Solteiros",
] as const;

export interface Stake extends RecordMetadata {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
}

export interface Ward extends RecordMetadata {
  id: string;
  stakeId: string;
  name: string;
  city: string;
  state: string;
  country: string;
  lunchPDayWeekday: Weekday;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: PermissionKey[];
}

export interface RecordMetadata {
  createdAt?: string;
  createdByUserId?: string;
  updatedAt?: string;
  updatedByUserId?: string;
  archivedAt?: string;
  archivedByUserId?: string;
}

export type RecordMetadataKey = keyof RecordMetadata;

export interface User extends RecordMetadata {
  id: string;
  authUserId?: string;
  wardId: string;
  memberId?: string;
  name: string;
  email: string;
  phone: string;
  status: UserStatus;
  accountType: UserAccountType;
  accessLevel: UserAccessLevel;
  roleId: string;
  permissionOverrides: PermissionKey[];
  permissionsConfigured?: boolean;
  createdAt: string;
  lastAccessAt?: string;
}

export interface StakeOwnerRequestApproval {
  userId: string;
  wardId: string;
  createdAt: string;
}

export interface StakeOwnerRequest extends RecordMetadata {
  id: string;
  stakeId: string;
  wardId: string;
  requesterUserId: string;
  status: StakeOwnerRequestStatus;
  approvals: StakeOwnerRequestApproval[];
  approvedAt?: string;
  resolvedAt?: string;
}

export interface MemberNote {
  id: string;
  memberId: string;
  createdAt: string;
  createdBy: string;
  text: string;
}

export interface Member extends RecordMetadata {
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
  speaker1Theme: string;
  speaker2: HybridField;
  speaker2Theme: string;
  intermediateHymn: HybridField;
  speaker3: HybridField;
  speaker3Theme: string;
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

export interface SacramentMinute extends RecordMetadata {
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
  lockedByUserId?: string;
  lockedAt?: string;
  lockExpiresAt?: string;
  version: number;
  versionIds: string[];
}

export interface Hymn extends RecordMetadata {
  id: string;
  hymnBookId: string;
  number: string;
  title: string;
  category: string;
  tags: string[];
  active: boolean;
}

export interface HymnBook extends RecordMetadata {
  id: string;
  name: string;
  emoji: string;
}

export interface MissionaryCompanionship extends RecordMetadata {
  id: string;
  wardId: string;
  name: string;
  type: MissionaryType;
  area: string;
  members: string[];
  status: "active" | "inactive";
}

export type LunchCompanionshipSnapshot = Pick<MissionaryCompanionship, "id" | "name" | "type" | "area">;

export interface HostHouse extends RecordMetadata {
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

export interface LunchSchedule extends RecordMetadata {
  id: string;
  wardId: string;
  date: string;
  time: string;
  companionshipIds: string[];
  companionshipSnapshots?: LunchCompanionshipSnapshot[];
  host: HybridField;
  hostMemberId: string;
  notes: string;
  confirmationStatus: ConfirmationStatus;
}

export interface Caravan extends RecordMetadata {
  id: string;
  wardId: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  returnDate: string;
  returnTime: string;
  seatMode: CaravanSeatMode;
  availableSeats: number;
}

export interface DocumentType extends RecordMetadata {
  id: string;
  name: string;
  active: boolean;
}

export interface CaravanPerson extends RecordMetadata {
  id: string;
  wardId: string;
  homeWardId: string;
  type: CaravanPersonType;
  name: string;
  birthDate: string;
  sex: "M" | "F";
  documentTypeId: string;
  documentValue: string;
  phone: string;
  notes: string;
}

export interface CaravanRegistration extends RecordMetadata {
  id: string;
  wardId: string;
  caravanId: string;
  personId: string;
  consumesSeat: boolean;
  isApproved: boolean;
  isPaid: boolean;
  createdAt: string;
}

export interface PatrolMember extends RecordMetadata {
  id: string;
  wardId: string;
  memberId?: string;
  name: string;
  phone: string;
  notes: string;
  active: boolean;
}

export interface PatrolSchedule extends RecordMetadata {
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
  dateFormat: DateFormat;
}

export interface Database {
  stakes: Stake[];
  wards: Ward[];
  roles: Role[];
  users: User[];
  stakeOwnerRequests: StakeOwnerRequest[];
  members: Member[];
  memberNotes: MemberNote[];
  sacramentMinutes: SacramentMinute[];
  minuteVersions: SacramentMinuteVersion[];
  hymnBooks: HymnBook[];
  hymns: Hymn[];
  missionaryCompanionships: MissionaryCompanionship[];
  hostHouses: HostHouse[];
  lunchSchedules: LunchSchedule[];
  caravans: Caravan[];
  caravanPeople: CaravanPerson[];
  caravanRegistrations: CaravanRegistration[];
  documentTypes: DocumentType[];
  patrolMembers: PatrolMember[];
  patrolSchedules: PatrolSchedule[];
  auditLogs: AuditLog[];
  appPreferences: AppPreferences;
  session: SessionState;
}
