import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { type UserRole, userRoles } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Checks if a user's role is sufficient to access a protected resource.
 * @param userRole The role of the current user.
 * @param requiredRole The minimum role required for access.
 * @returns boolean
 */
export const checkRole = (
  userRole: UserRole,
  requiredRole: UserRole
): boolean => {
  const userRoleIndex = userRoles.indexOf(userRole);
  const requiredRoleIndex = userRoles.indexOf(requiredRole);

  // If a role is not found, treat it as an insufficient permission.
  if (userRoleIndex === -1 || requiredRoleIndex === -1) {
    return false;
  }

  // A user's role is sufficient if its index is greater than or equal to the required role's index.
  return userRoleIndex >= requiredRoleIndex;
};

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
