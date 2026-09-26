import {
	getAppointmentLocation,
	getAppointmentType,
	getProbableNameFromTitle,
} from "~/lib/appointment-title";
import { formatInBusinessTime, formatPhoneNumber } from "~/lib/utils";

// Questionnaire statuses whose "sent" date is redundant once the
// questionnaire is done, so the block omits it.
const HIDE_SENT_STATUSES = new Set(["COMPLETED", "EXTERNAL"]);

export interface AppointmentBlockQuestionnaire {
	type: string | null;
	status: string | null;
	sent: string | null;
}

export interface AppointmentBlockClientInfo {
	fullName: string;
	age: string;
	phoneNumber: string | null;
	records: string | false;
	babyNetERStatus: string | false;
	questionnaires: AppointmentBlockQuestionnaire[];
	clientNoteTitle: string | null;
	clientNote: string;
}

/**
 * Builds the same per-appointment text block the weekly appointment-agenda
 * email sends, so the client page's copy button and the agenda script never
 * drift apart. `client` is omitted when no client record could be matched,
 * matching the agenda script's fallback to a name guessed from the title.
 */
export function formatAppointmentInfoBlock(params: {
	title: string;
	startTime: Date;
	includePhone: boolean;
	client?: AppointmentBlockClientInfo | null;
}): string {
	const { title, startTime, includePhone, client } = params;

	const clientName = client?.fullName || getProbableNameFromTitle(title);
	const time = formatInBusinessTime(startTime, "h:mm a");

	const lines = [`NAME: ${clientName}`, `TIME: ${time}`];

	if (includePhone) {
		const phone = client?.phoneNumber
			? formatPhoneNumber(client.phoneNumber)
			: "N/A";
		lines.push(`PHONE NUMBER: ${phone}`);
	}

	lines.push(`LOCATION: ${getAppointmentLocation(title)}`);

	if (client?.age) {
		lines.push(`AGE: ${client.age}`);
	}

	if (client?.records) {
		lines.push(`RECORDS: ${client.records}`);
	}

	if (client?.babyNetERStatus) {
		lines.push(`BabyNet Evaluation Report: ${client.babyNetERStatus}`);
	}

	if (client?.questionnaires && client.questionnaires.length > 0) {
		lines.push("QUESTIONNAIRES:");
		for (const q of client.questionnaires) {
			let line = `  - ${q.type}: ${q.status}`;
			if (q.sent && q.status && !HIDE_SENT_STATUSES.has(q.status)) {
				line += ` (sent ${q.sent})`;
			}
			lines.push(line);
		}
	}

	lines.push(`APPOINTMENT TYPE: ${getAppointmentType(title)}`);

	const notesParts = [client?.clientNoteTitle, client?.clientNote].filter(
		Boolean,
	);
	lines.push(`NOTES: ${notesParts.join(" - ")}`);

	return lines.join("\n");
}
