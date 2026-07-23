import { type ClassValue, clsx } from "clsx";
import { type AnyColumn, type SQL, sql } from "drizzle-orm";
import { twMerge } from "tailwind-merge";
import type { InsuranceWithAliases } from "~/lib/models";
import type { PermissionId, PermissionsObject } from "~/lib/types";
import { PERMISSION_MAP, type QUESTIONNAIRE_STATUSES } from "./constants";

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
			(1000 * 60 * 60 * 24 * 30.44),
	);
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

export const getLocalDayFromUTCDate = (
	utcDate: Date | string | undefined | null,
): Date | undefined => {
	if (!utcDate) return undefined;

	const d = new Date(utcDate);

	if (Number.isNaN(d.getTime())) {
		return undefined;
	}

	return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

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

export const formatShortDate = (
	date: Date | string | undefined | null,
	fallback = "N/A",
): string => {
	return (
		getLocalDayFromUTCDate(date)?.toLocaleDateString(undefined, {
			year: "2-digit",
			month: "numeric",
			day: "numeric",
		}) ?? fallback
	);
};

export const getLocalTimeFromUTCDate = (
	utcDate: Date | string | undefined | null,
): Date | undefined => {
	if (!utcDate) return undefined;

	const d = new Date(utcDate);

	if (Number.isNaN(d.getTime())) {
		return undefined;
	}

	return new Date(
		d.getUTCFullYear(),
		d.getUTCMonth(),
		d.getUTCDate(),
		d.getUTCHours(),
		d.getUTCMinutes(),
		d.getUTCSeconds(),
	);
};

export function getClosestOfficeKey(
	clientLat: number,
	clientLon: number,
	allOffices: Array<{ key: string; latitude: string; longitude: string }>,
): string | undefined {
	if (!allOffices.length) return undefined;
	const toRad = (v: number) => (v * Math.PI) / 180;
	let closestKey: string | undefined;
	let minDist = Infinity;
	for (const office of allOffices) {
		const lat2 = parseFloat(office.latitude);
		const lon2 = parseFloat(office.longitude);
		const cosAngle = Math.min(
			1,
			Math.cos(toRad(clientLat)) *
				Math.cos(toRad(lat2)) *
				Math.cos(toRad(lon2) - toRad(clientLon)) +
				Math.sin(toRad(clientLat)) * Math.sin(toRad(lat2)),
		);
		const dist = 3959 * Math.acos(cosAngle);
		if (dist < minDist) {
			minDist = dist;
			closestKey = office.key;
		}
	}
	return closestKey;
}

export const getDistanceSQL = (
	lat1: SQL | AnyColumn | string | number | null | undefined,
	lon1: SQL | AnyColumn | string | number | null | undefined,
	lat2: SQL | AnyColumn | string | number | null | undefined,
	lon2: SQL | AnyColumn | string | number | null | undefined,
) => {
	return sql<number>`(3959 * acos(
		cos(radians(${lat1})) *
		cos(radians(${lat2})) *
		cos(radians(${lon2}) - radians(${lon1})) +
		sin(radians(${lat1})) *
		sin(radians(${lat2}))
	))`;
};

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
