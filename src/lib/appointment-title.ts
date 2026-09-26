/**
 * Parses a Google Calendar appointment title into the same location/type
 * strings the weekly appointment-agenda email uses, so the client page's
 * "copy info" button and the agenda script agree without duplicating logic.
 * Ported from the appointment-agenda Google Apps Script.
 */

const LOCATION_TYPE_REGEX = /\[([^[\]]*?)-(DE|D|E)\]/;
const VIRTUAL_REGEX = /\[V\]/;
const MYRTLE_BEACH_REGEX = /\{MB\}/;

export function getAppointmentLocation(title: string): string {
	const match = title.match(LOCATION_TYPE_REGEX);
	if (match?.[1]) {
		const locationKey = match[1].toLowerCase();
		switch (locationKey) {
			case "chs":
				return "Charleston Office";
			case "sum":
				return "Summerville Office";
			case "mb":
				return "Myrtle Beach Office";
			case "columbia":
			case "col":
				return "Columbia Office";
			case "home":
				return "In-Home Visit";
			default:
				return `Unknown, found: ${match[1]}`;
		}
	}
	if (VIRTUAL_REGEX.test(title)) return "Virtual";
	if (MYRTLE_BEACH_REGEX.test(title)) return "Myrtle Beach Office";
	return "Unknown";
}

export function getAppointmentType(title: string): string {
	const match = title.match(LOCATION_TYPE_REGEX);
	const isVirtual = VIRTUAL_REGEX.test(title);

	let typeString = "Unknown";
	if (match?.[2]) {
		switch (match[2]) {
			case "D":
				typeString = "DA";
				break;
			case "E":
				typeString = "Evaluation";
				break;
			case "DE":
				typeString = "DA + Evaluation";
				break;
		}
	} else if (isVirtual) {
		typeString = "DA";
	}

	const daEvalMatch = title.match(/(^|\s)(DA|EVAL|DA\+EVAL)($|\s)/i);
	if (daEvalMatch?.[2]) {
		switch (daEvalMatch[2].toUpperCase()) {
			case "DA":
				typeString = "DA";
				break;
			case "EVAL":
				typeString = "Evaluation";
				break;
			case "DA+EVAL":
				typeString = "DA + Evaluation";
				break;
		}
	}

	const prefixAdditions: string[] = [];
	if (/ADHD/.test(title)) prefixAdditions.push("ADHD");
	if (/\sLD\s/.test(title)) prefixAdditions.push("LD");
	if (prefixAdditions.length > 0) {
		typeString = `${prefixAdditions.join(" ")} ${typeString}`;
	}

	const wInterpMatch = title.match(/w\/interp (\w+)/);
	if (wInterpMatch?.[1]) {
		typeString += ` w/interp ${wInterpMatch[1]}`;
	} else if (/\[I\]/.test(title)) {
		typeString += " w/interp";
	}

	return typeString;
}

function capitalizeName(name: string): string {
	return name
		.split(" ")
		.map((word) =>
			word
				.split("-")
				.map((part) => {
					if (part.toUpperCase() === part || part.toLowerCase() === part) {
						return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
					}
					return part;
				})
				.join("-"),
		)
		.join(" ");
}

/**
 * Best-effort client name derived from the calendar title itself, used when
 * no client record could be matched (mirrors the agenda script's fallback
 * for events whose description has no client id).
 */
export function getProbableNameFromTitle(title: string): string {
	let eventTitle = title;
	const bracketIndex = eventTitle.indexOf("[");
	if (bracketIndex !== -1) {
		eventTitle = eventTitle.substring(0, bracketIndex).trim();
	}

	eventTitle = eventTitle
		.replace(/\s{2,}/g, " ")
		.replace(/\{[^}]+\}/g, "")
		.replace(/\*.*?\*/g, "")
		.trim();

	const appointmentType = getAppointmentType(eventTitle);
	const typeParts = appointmentType
		.split(" ")
		.map((part) => (part === "Evaluation" ? "EVAL" : part));

	let earliestIndex = eventTitle.length;
	for (const part of typeParts) {
		const index = eventTitle.indexOf(part);
		if (index !== -1 && index < earliestIndex) {
			earliestIndex = index;
		}
	}

	const name =
		earliestIndex !== eventTitle.length
			? eventTitle.substring(0, earliestIndex).trim()
			: eventTitle;

	return capitalizeName(name);
}
