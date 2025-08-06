import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatClientAge(dob: Date, format = "long") {
  const ageInMilliseconds = Date.now() - dob.getTime();
  const years = Math.floor(ageInMilliseconds / (1000 * 60 * 60 * 24 * 365.25));
  const months = Math.floor(
    (ageInMilliseconds % (1000 * 60 * 60 * 24 * 365.25)) /
      (1000 * 60 * 60 * 24 * 30.44)
  );
  if (format === "short") {
    return `${years}:${months}`;
  }
  if (format === "years") {
    return `${years}`;
  }
  return years >= 3 ? `${years} years` : `${years} years, ${months} months`;
}

export const normalizeDate = (date: Date) => {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      12,
      0,
      0,
      0
    )
  );
};

export type QuestionnaireStatus =
  | "COMPLETED"
  | "PENDING"
  | "RESCHEDULED"
  | string
  | null
  | undefined;

const STATUS_COLOR_MAP: Record<string, string> = {
  COMPLETED: "text-green-300",
  PENDING: "text-yellow-500",
  RESCHEDULED: "text-red-500",
};

export function getStatusColorClass(status: QuestionnaireStatus): string {
  if (!status) return "text-gray-500"; // Default color for unknown/null status
  return STATUS_COLOR_MAP[status] ?? "text-gray-500";
}

export function getReminderColorClass(
  count: number | null | undefined
): string {
  if (!count || count === 0) {
    return "";
  }
  if (count >= 3) {
    return "text-red-500";
  }
  if (count >= 2) {
    return "text-yellow-500";
  }
  if (count >= 1) {
    return "text-green-300";
  }
  return "";
}
