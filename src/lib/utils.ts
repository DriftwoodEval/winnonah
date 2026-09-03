import { type ClassValue, clsx } from "clsx";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { twMerge } from "tailwind-merge";
import type { InsuranceWithAliases } from "~/lib/models";
import type { PermissionId, PermissionsObject } from "~/lib/types";
import {
	BUSINESS_TIMEZONE,
	PERMISSION_MAP,
	type QUESTIONNAIRE_STATUSES,
} from "./constants";

export const IS_DEV = process.env.NODE_ENV === "development";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function toTitleCase(str: string): string {
	return str.replace(
		/\w\S*/g,
		(text) => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase(),
	);
}

export function hasPermission(
	userPerms: PermissionsObject,
	permission: PermissionId,
): boolean {
	return !!userPerms[permission];
}

/**
 * Reformat an error message to be friendlier by replacing permission IDs with their titles.
 */
export function formatError(message: string): string {
	if (message === "UNAUTHORIZED") {
		return "You do not have permission to perform this action.";
	}

	let formattedMessage = message;

	for (const [id, title] of Object.entries(PERMISSION_MAP)) {
		if (formattedMessage.includes(id)) {
			formattedMessage = formattedMessage.replaceAll(id, `"${title}"`);
		}
	}

	return formattedMessage;
}

export const getInsuranceShortName = (
	officialName: string | null,
	insurances: InsuranceWithAliases[],
) => {
	if (!officialName) return null;
	const insurance = insurances.find(
		(i) =>
			i.shortName === officialName ||
			i.aliases.some((a) => a.name === officialName),
	);
	return insurance?.shortName || officialName;
};

export const mapInsuranceToShortNames = (
	primary: string | null,
	secondary: string[] | null,
	insurances: InsuranceWithAliases[],
) => {
	const shortNames = [getInsuranceShortName(primary, insurances)];

	if (secondary) {
		for (const s of secondary) {
			shortNames.push(getInsuranceShortName(s, insurances));
		}
	}

	return shortNames.filter(Boolean).join(" | ");
};

export const getInsuranceShortNamesList = (
	primary: string | null,
	secondary: string[] | null,
	insurances: InsuranceWithAliases[],
): string[] => {
	const names: string[] = [];

	const addInsurance = (insuranceName: string | null) => {
		if (!insuranceName) return;
		const shortName = getInsuranceShortName(insuranceName, insurances);
		if (shortName && !names.includes(shortName)) {
			names.push(shortName);
		}
	};

	addInsurance(primary);
	if (secondary) {
		for (const s of secondary) {
			addInsurance(s);
		}
	}
	return names;
};

/**
 * Calculate a client's age in whole years and months given their date of
 * birth, as of business-local "today". Returns undefined if dob is missing
 * or unparseable.
 */
export function calculateAgeYearsMonths(
	dob: string | undefined | null,
): { years: number; months: number } | undefined {
	const parsed = parseDateOnly(dob);
	if (!parsed) return undefined;

	// Use business-local "today", not the reading process's own timezone:
	// local Date getters would make this non-deterministic (e.g. shift a day
	// depending on whether the server/CI runner is behind or ahead of UTC).
	const today = parseDateOnly(formatInBusinessTime(new Date(), "yyyy-MM-dd"));
	if (!today) return undefined;

	let years = today.year - parsed.year;
	let months = today.month - parsed.month;
	if (today.day < parsed.day) {
		months -= 1;
	}
	if (months < 0) {
		years -= 1;
		months += 12;
	}
	return { years, months };
}

/**
 * Format a client's age given their date of birth.
 * @param dob The client's date of birth, as a "YYYY-MM-DD" date-only string.
 * @param format The format of the returned age. Can be "short", "years", or "long".
 *   - "short": "X:Y" where X is the number of years and Y is the number of months.
 *   - "years": The number of years as a string.
 *   - "long": A human-readable string like "X years" or "X years, Y months".
 * @returns The formatted age.
 */
export function formatClientAge(dob: string, format = "long") {
	const age = calculateAgeYearsMonths(dob);
	if (!age) {
		return format === "years" ? "0" : "0 years";
	}
	const { years, months } = age;

	if (format === "short") {
		return years >= 3 ? `${years}` : `${years}:${months}`;
	}
	if (format === "years") {
		return `${years}`;
	}
	return years >= 3 ? `${years} years` : `${years} years, ${months} months`;
}

const STATUS_COLOR_MAP: Record<string, string> = {
	COMPLETED: "text-success",
	PENDING: "text-warning",
	SPANISH: "text-warning",
	IGNORING: "text-error",
};

export function getStatusColorClass(
	status: (typeof QUESTIONNAIRE_STATUSES)[number] | null,
): string {
	if (!status) return "text-gray-500"; // Default color for unknown/null status
	return STATUS_COLOR_MAP[status] ?? "text-gray-500";
}

export function getReminderColorClass(
	count: number | null | undefined,
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

export function formatReminderOffset(hours: number): string {
	if (hours >= 24) {
		const days = hours / 24;
		const formatted = Number.isInteger(days) ? days : days.toFixed(1);
		return `${formatted} ${days === 1 ? "day" : "days"} before`;
	}
	return `${hours}h before`;
}

export function formatPhoneNumber(phoneNumber: string) {
	const digits = phoneNumber.replace(/\D/g, "");
	return digits.replace(
		/^(1)?(\d{3})(\d{3})(\d{4})$/,
		(_, country, a, b, c) => {
			const prefix = country ? "+1 " : "";
			return `${prefix}(${a}) ${b}-${c}`;
		},
	);
}

export function normalizePhoneNumber(phoneNumber: string) {
	const digits = phoneNumber.replace(/\D/g, "");
	if (digits.length === 10) {
		return `+1${digits}`;
	}
	if (digits.length === 11 && digits.startsWith("1")) {
		return `+${digits}`;
	}
	return `+${digits}`;
}

/**
 * Parse a date-only "YYYY-MM-DD" value into its year/month/day parts, for
 * calendar arithmetic (sorting, age calculation, comparisons) without ever
 * constructing a Date object from it. Date-only columns have no time
 * component or timezone, so there's nothing for a Date object to represent.
 */
export function parseDateOnly(
	date: string | undefined | null,
): { year: number; month: number; day: number } | undefined {
	if (!date) return undefined;
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
	if (!match?.[1] || !match[2] || !match[3]) return undefined;
	return {
		year: Number(match[1]),
		month: Number(match[2]),
		day: Number(match[3]),
	};
}

/**
 * Compare two date-only "YYYY-MM-DD" values chronologically. Nullish values
 * sort first. Usable directly as an Array.prototype.sort comparator.
 */
export function compareDateOnly(
	a: string | undefined | null,
	b: string | undefined | null,
): number {
	if (!a && !b) return 0;
	if (!a) return -1;
	if (!b) return 1;
	return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Convert a date-only "YYYY-MM-DD" value into a Date at local midnight, for
 * UI components (date pickers, date-fns comparisons) that require a Date
 * object to represent a calendar day. Builds the Date from the string's own
 * year/month/day digits rather than parsing it as an instant, so the result
 * always matches the stored calendar date regardless of local timezone.
 */
export function dateOnlyToLocalDate(
	date: string | undefined | null,
): Date | undefined {
	const parsed = parseDateOnly(date);
	if (!parsed) return undefined;
	return new Date(parsed.year, parsed.month - 1, parsed.day);
}

/**
 * Convert a Date (e.g. from a date picker) into a "YYYY-MM-DD" date-only
 * string, using its local calendar date. Inverse of dateOnlyToLocalDate.
 */
export function localDateToDateOnly(
	date: Date | undefined | null,
): string | undefined {
	if (!date) return undefined;
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/**
 * Whether a date-only "YYYY-MM-DD" value is strictly before today, in terms
 * of the server's local calendar date.
 */
export function isDateOnlyPast(date: string | undefined | null): boolean {
	if (!date) return false;
	const today = new Date();
	const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
	return date < todayStr;
}

export function formatTaMessage(
	questionnaires: { questionnaireType: string; link: string | null }[],
): string {
	return questionnaires
		.map(({ questionnaireType, link }, index) => {
			const notes = questionnaireType.includes("Self")
				? " - For client being tested"
				: "";
			return `${index + 1}) ${link}${notes}`;
		})
		.join("\n");
}

/**
 * Format a date-only "YYYY-MM-DD" column value as M/D/YY. Formats the parts
 * directly rather than going through a Date object, so there's no local
 * timezone to shift the day by.
 */
export const formatShortDate = (
	date: string | undefined | null,
	fallback = "N/A",
): string => {
	const parsed = parseDateOnly(date);
	if (!parsed) return fallback;
	return `${parsed.month}/${parsed.day}/${String(parsed.year).slice(2)}`;
};

/**
 * Format a date-only "YYYY-MM-DD" column value as M/D/YYYY.
 */
export const formatDateOnlyLong = (
	date: string | undefined | null,
	fallback = "",
): string => {
	const parsed = parseDateOnly(date);
	if (!parsed) return fallback;
	return `${parsed.month}/${parsed.day}/${parsed.year}`;
};

const SHORT_MONTH_NAMES = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

/**
 * Format a date-only "YYYY-MM-DD" column value as "Mon D, YYYY".
 */
export const formatDateOnlyMedium = (
	date: string | undefined | null,
	fallback = "",
): string => {
	const parsed = parseDateOnly(date);
	if (!parsed) return fallback;
	return `${SHORT_MONTH_NAMES[parsed.month - 1]} ${parsed.day}, ${parsed.year}`;
};

/**
 * Convert a true-instant (timestamp) column value, e.g. `startTime` or
 * `updatedAt`, into a Date whose local getters (getHours, getDate, etc.)
 * reflect the practice's business timezone rather than the browser/server's
 * own timezone. For grid math and other calendar arithmetic that needs
 * numeric hour/minute/day values; for display use formatInBusinessTime.
 */
export function toBusinessZonedTime(
	date: Date | string | undefined | null,
): Date | undefined {
	if (!date) return undefined;
	const d = toZonedTime(date, BUSINESS_TIMEZONE);
	if (Number.isNaN(d.getTime())) return undefined;
	return d;
}

/**
 * Format a true-instant (timestamp) column value in the practice's business
 * timezone, regardless of the browser/server's own timezone. `pattern` is a
 * date-fns format string (see date-fns `format` docs).
 */
export function formatInBusinessTime(
	date: Date | string | undefined | null,
	pattern: string,
	fallback = "N/A",
): string {
	if (!date) return fallback;
	const d = new Date(date);
	if (Number.isNaN(d.getTime())) return fallback;
	return formatInTimeZone(d, BUSINESS_TIMEZONE, pattern);
}

/**
 * Format the calendar day of a true-instant (timestamp) column value as
 * M/D/YY, e.g. `startTime` or `createdAt`, in business-local time.
 */
export const formatShortInstantDate = (
	date: Date | string | undefined | null,
	fallback = "N/A",
): string => formatInBusinessTime(date, "M/d/yy", fallback);

/**
 * Convert a Date whose local getters (getHours, getDate, etc.) represent
 * business-local wall-clock time, e.g. one produced by a date/time picker or
 * by `toBusinessZonedTime`, into the true UTC instant it refers to. Inverse
 * of `toBusinessZonedTime`, for writing timestamp columns from UI input.
 */
export function businessZonedTimeToUtcInstant(localDate: Date): Date {
	const year = localDate.getFullYear();
	const month = String(localDate.getMonth() + 1).padStart(2, "0");
	const day = String(localDate.getDate()).padStart(2, "0");
	const hours = String(localDate.getHours()).padStart(2, "0");
	const minutes = String(localDate.getMinutes()).padStart(2, "0");
	const seconds = String(localDate.getSeconds()).padStart(2, "0");
	return fromZonedTime(
		`${year}-${month}-${day}T${hours}:${minutes}:${seconds}`,
		BUSINESS_TIMEZONE,
	);
}

/**
 * Straight-line (great-circle) distance in miles between two lat/lon points.
 */
export function haversineMiles(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
): number {
	const toRad = (v: number) => (v * Math.PI) / 180;
	const cosAngle = Math.min(
		1,
		Math.cos(toRad(lat1)) *
			Math.cos(toRad(lat2)) *
			Math.cos(toRad(lon2) - toRad(lon1)) +
			Math.sin(toRad(lat1)) * Math.sin(toRad(lat2)),
	);
	return 3959 * Math.acos(cosAngle);
}

/**
 * Distance in miles from a client to one office: the real by-car distance
 * cached in emr_office_drive_time (backfilled by office_drive_times.py,
 * refreshed live when staff open a client's Drive Times popup) when we have
 * one, else the straight-line fallback for a client not yet backfilled or whose
 * last Waze lookup failed. Every closest-office ranking (filter, sort,
 * single-client lookup) uses this so they all agree.
 */
export function getOfficeDistanceMiles(
	clientLat: number,
	clientLon: number,
	office: { latitude: string; longitude: string },
	driveMiles?: number,
): number {
	return (
		driveMiles ??
		haversineMiles(
			clientLat,
			clientLon,
			parseFloat(office.latitude),
			parseFloat(office.longitude),
		)
	);
}

/**
 * Picks the key of the office closest to a client, preferring a cached real
 * drive distance (miles, keyed by office key) over the straight-line fallback.
 * Ties break toward the earlier office in `allOffices`.
 */
export function getClosestOfficeKey(
	clientLat: number,
	clientLon: number,
	allOffices: Array<{ key: string; latitude: string; longitude: string }>,
	driveMilesByOfficeKey?: Map<string, number>,
): string | undefined {
	if (!allOffices.length) return undefined;
	let closestKey: string | undefined;
	let minDist = Infinity;
	for (const office of allOffices) {
		const dist = getOfficeDistanceMiles(
			clientLat,
			clientLon,
			office,
			driveMilesByOfficeKey?.get(office.key),
		);
		if (dist < minDist) {
			minDist = dist;
			closestKey = office.key;
		}
	}
	return closestKey;
}

/**
 * Check if a client ID is a notes only client ID (5 characters long).
 */
export function isNotesOnlyClientId(
	id: string | number | undefined | null,
): boolean {
	if (id === undefined || id === null) return false;
	return id.toString().length === 5;
}

/**
 * True when an error is a transient connectivity failure rather than a real
 * application error: the request never reached the API, or the reverse proxy
 * returned its HTML maintenance/error page instead of JSON (which surfaces as a
 * "Unexpected token '<'" JSON parse error in the tRPC client).
 */
export function isServerUnavailableError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error ?? "");
	return (
		message.includes("<!DOCTYPE") ||
		message.includes("Unexpected token '<'") ||
		message.includes("is not valid JSON") ||
		message.includes("Failed to fetch") ||
		message.includes("NetworkError") ||
		message.includes("Load failed")
	);
}

/**
 * Create a deterministic color for a user based on their name
 */
export function userBadgeStyle(name: string): React.CSSProperties {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = (hash * 31 + name.charCodeAt(i)) | 0;
	}
	const hue = Math.abs(hash) % 360;
	return { backgroundColor: `hsl(${hue} 55% 40%)`, color: "white" };
}
