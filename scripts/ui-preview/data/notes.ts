import { doc, userAt } from "./adminReview";

const NOW = new Date("2026-11-22T15:00:00.000Z");
const HOUR = 3_600_000;

const NOTE_VERSIONS = [
	doc("Parent called to ask about scheduling."),
	doc(
		"Parent called to ask about scheduling.",
		"Prefers mornings, no Fridays.",
	),
	doc(
		"Parent called to ask about scheduling.",
		"Prefers mornings, no Fridays.",
		"Sibling is also a client.",
	),
];

const RECORD_VERSIONS = [
	doc("Pediatrician: requested 11/10."),
	doc("Pediatrician: requested 11/10.", "School: received 11/15."),
	doc(
		"Pediatrician: requested 11/10.",
		"School: received 11/15.",
		"Prior testing: none on file.",
	),
];

/** Clients that have a general note (every third) or an external records note (every fourth). */
const hasNote = (clientId: number) => clientId % 3 === 0;
const hasRecord = (clientId: number) => clientId % 4 === 0;

/** `notes.getNoteByClientId` */
export const noteByClientId = (clientId: unknown) =>
	typeof clientId === "number" && hasNote(clientId)
		? {
				clientId,
				contentJson: NOTE_VERSIONS[2] ?? null,
				title: "Front desk note",
			}
		: null;

/** `externalRecords.getExternalRecordByClientId` */
export const recordByClientId = (clientId: unknown) =>
	typeof clientId === "number" && hasRecord(clientId)
		? {
				clientId,
				contentJson: RECORD_VERSIONS[2] ?? null,
				requests: [
					{
						id: 1,
						clientId,
						requestedDate: "2026-11-10",
						holdUntil: null,
						customMessage: null,
						createdAt: new Date(NOW.getTime() - 288 * HOUR),
						createdBy: userAt(1).email,
					},
				],
			}
		: null;

/** Current version first (id -1, `isCurrent` present only on it), then older ones. */
const versions = (contents: ReturnType<typeof doc>[], title?: string) =>
	[2, 1, 0].map((v, i) => {
		const user = userAt(i);
		return {
			id: i === 0 ? -1 : v,
			...(i === 0 ? { isCurrent: true } : {}),
			content: contents[v],
			title: title ?? null,
			updatedBy: user.email,
			createdAt: new Date(NOW.getTime() - (3 + i * 20) * HOUR),
			updatedByName: user.name,
			updatedByImage: null,
		};
	});

/** `notes.getHistory` */
export const noteHistory = (raw: unknown) => {
	const { noteId } = raw as { noteId: number };
	return hasNote(noteId) ? versions(NOTE_VERSIONS, "Front desk note") : [];
};

/** `externalRecords.getHistory` */
export const recordHistory = (raw: unknown) => {
	const { noteId } = raw as { noteId: number };
	return hasRecord(noteId) ? versions(RECORD_VERSIONS) : [];
};

/** `evaluatorDashboard.getNoteHistory`: the current note, then two older versions with different text. */
export const appointmentNoteHistory = () => {
	const texts = [
		["Client was engaged and cooperative.", "Follow up on school records."],
		["Client was engaged and cooperative."],
		["Client arrived on time."],
	];
	return texts.map((paragraphs, i) => {
		const user = userAt(i);
		return {
			id: i === 0 ? "current-note" : String(i),
			content: doc(...paragraphs),
			updatedBy: user.email,
			createdAt: new Date(NOW.getTime() - i * 26 * HOUR),
			updatedByName: user.name,
			updatedByImage: null,
			isCurrent: i === 0,
		};
	});
};

/** `reports.noteHistory`: newest first, with one cleared entry. */
export const reportNoteHistory = () =>
	[
		"Waiting on the school to send the IEP.",
		"Waiting on the school.",
		null,
		"Started draft.",
	].map((note, i) => {
		const user = userAt(i + 1);
		return {
			id: i + 1,
			note,
			updatedBy: user.email,
			updatedByName: user.name,
			createdAt: new Date(NOW.getTime() - i * 30 * HOUR),
		};
	});
