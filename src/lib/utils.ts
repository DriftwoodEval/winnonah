import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function formatClientAge(dob: Date, format = "long") {
	const ageInMilliseconds = new Date().getTime() - dob.getTime();
	const years = Math.floor(ageInMilliseconds / (1000 * 60 * 60 * 24 * 365.25));
	const months = Math.floor(
		(ageInMilliseconds % (1000 * 60 * 60 * 24 * 365.25)) /
			(1000 * 60 * 60 * 24 * 30.44),
	);
	if (format === "short") {
		return `${years}:${months}`;
	}
	return years >= 3 ? `${years} years` : `${years} years, ${months} months`;
}
