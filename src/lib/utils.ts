import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type {
  PermissionId,
  PermissionsObject,
  QUESTIONNAIRE_STATUSES,
} from "~/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function hasPermission(
  userPerms: PermissionsObject,
  permission: PermissionId
): boolean {
  return !!userPerms[permission];
}

/**
 * Format a client's age given their date of birth.
 * @param dob The client's date of birth.
 * @param format The format of the returned age. Can be "short", "years", or "long".
 *   - "short": "X:Y" where X is the number of years and Y is the number of months.
 *   - "years": The number of years as a string.
 *   - "long": A human-readable string like "X years" or "X years, Y months".
 * @returns The formatted age.
 */
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

const STATUS_COLOR_MAP: Record<string, string> = {
  COMPLETED: "text-success",
  PENDING: "text-warning",
  IGNORING: "text-error",
};

export function getStatusColorClass(
  status: (typeof QUESTIONNAIRE_STATUSES)[number] | null
): string {
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
    return "text-error";
  }
  if (count >= 2) {
    return "text-warning";
  }
  if (count >= 1) {
    return "text-success";
  }
  return "";
}

export function formatPhoneNumber(phoneNumber: string) {
  const digits = phoneNumber.replace(/\D/g, "");
  return digits.replace(
    /^(1)?(\d{3})(\d{3})(\d{4})$/,
    (_, country, a, b, c) => {
      const prefix = country ? "+1 " : "";
      return `${prefix}(${a}) ${b}-${c}`;
    }
  );
}
