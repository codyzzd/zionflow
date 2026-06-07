import { normalizeDateInput } from "@/lib/utils";
import type { CalendarWeekStartsOn, Member } from "@/types/domain";

export type MemberBirthday = {
  member: Member;
  birthDate: string;
  date: string;
  day: number;
  month: number;
  age: number;
};

export type BirthdayMonthCell = {
  date: Date;
  key: string;
  day: number;
  isCurrentMonth: boolean;
};

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function getMemberBirthdayForYear(member: Member, year: number): MemberBirthday | null {
  const birthDate = normalizeDateInput(member.birthDate);
  if (!birthDate) return null;

  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  if (birthYear > year) return null;

  const month = birthMonth;
  const day = birthMonth === 2 && birthDay === 29 && !isLeapYear(year) ? 28 : birthDay;
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return {
    member,
    birthDate,
    date,
    day,
    month,
    age: year - birthYear,
  };
}

export function getMemberBirthdaysForMonth(members: Member[], monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth() + 1;

  return members
    .filter((member) => !member.archivedAt)
    .map((member) => getMemberBirthdayForYear(member, year))
    .filter((birthday): birthday is MemberBirthday => Boolean(birthday && birthday.month === month))
    .sort((birthdayA, birthdayB) => birthdayA.day - birthdayB.day || birthdayA.member.name.localeCompare(birthdayB.member.name, "pt-BR"));
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function buildMemberBirthdaysCsv(birthdays: MemberBirthday[]) {
  const rows = birthdays.map((birthday) => [birthday.member.name, birthday.member.phone]);

  return [["Nome", "Telefone"], ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
}

export function buildBirthdayMonthCells(monthDate: Date, weekStartsOn: CalendarWeekStartsOn): BirthdayMonthCell[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekday = (firstDay.getDay() - (weekStartsOn === "monday" ? 1 : 0) + 7) % 7;

  return Array.from({ length: 42 }, (_, index) => {
    const dayOffset = index - firstWeekday + 1;
    const date = new Date(year, month, dayOffset);

    return {
      date,
      key: toDateKey(date),
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
    };
  });
}
