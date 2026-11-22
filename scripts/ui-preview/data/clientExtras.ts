import { userAt } from "./adminReview";
import { FAKE_CLIENTS } from "./clients";
import { FAKE_OFFICES } from "./practice";

const NOW = new Date("2026-11-22T15:00:00.000Z");
const HOUR = 3_600_000;

/** `clients.getOfficeDriveTimes`: one row per active office, nearest first. */
export const OFFICE_DRIVE_TIMES = FAKE_OFFICES.filter(
	(o) => !o.prettyName.includes("archived"),
)
	.map((o, i) => ({
		key: o.key,
		prettyName: o.prettyName,
		latitude: o.latitude,
		longitude: o.longitude,
		durationMinutes: 18 + i * 22,
		distanceMiles: 12 + i * 24,
		straightLineMiles: 9 + i * 19,
	}))
	.sort((a, b) => a.durationMinutes - b.durationMinutes);

/** `clients.getReferralHistory`: newest first. */
export const REFERRAL_HISTORY = [
	{
		id: 3,
		createdAt: new Date(NOW.getTime() - 5 * HOUR),
		actor: userAt(1).name,
		description: "Marked the referral form as complete",
	},
	{
		id: 2,
		createdAt: new Date(NOW.getTime() - 29 * HOUR),
		actor: "Automatic",
		description: "Sent the referral questionnaire reminder",
	},
	{
		id: 1,
		createdAt: new Date(NOW.getTime() - 77 * HOUR),
		actor: userAt(0).name,
		description: "Changed the school district to Spartanburg 7",
	},
];

/** `ddsQueue.listClientPdfs`: PDFs in the client's Drive folder. */
export const CLIENT_PDFS = [
	{ id: "pdf-3", name: "2026 School Evaluation.pdf" },
	{ id: "pdf-2", name: "Pediatrician Records.pdf" },
	{ id: "pdf-1", name: "Intake Packet.pdf" },
];

/** `google.getPushPreview`: what will be pushed to Punchlist for this client. */
export const pushPreview = (clientId: unknown) => {
	const c = (FAKE_CLIENTS.find((x) => x.id === clientId) ??
		FAKE_CLIENTS[0]) as (typeof FAKE_CLIENTS)[number];
	return {
		id: c.id,
		fullName: c.fullName,
		asdAdhd: c.asdAdhd,
		language: c.language,
		primaryPayer: c.privatePay ? "Private Pay" : "Molina",
		secondaryPayer: null,
		privatePay: c.privatePay,
		location: "Charleston",
		daQsNeeded: true,
		evalQsNeeded: true,
		recordsNeeded: "Needed" as const,
		isCharterSchoolUnconfirmed: false,
	};
};

/** `offices.lookupAddress`: geocoder candidates, best first. */
export const ADDRESS_CANDIDATES = [
	{
		formattedAddress: "100 Main St, Greenville, SC 29601, USA",
		latitude: 34.8526,
		longitude: -82.394,
		accuracy: 1,
	},
	{
		formattedAddress: "100 Main St, Greer, SC 29651, USA",
		latitude: 34.9387,
		longitude: -82.2271,
		accuracy: 0.6,
	},
];

/** `appointments.getReminderTimeline`: two sent reminders and two pending, one overdue. */
export const reminderTimeline = () => ({
	appointmentTime: new Date(NOW.getTime() + 48 * HOUR),
	officeName: "Greenville",
	officeLocationPhrase: "in Greenville",
	clientPreferredName: "Susana",
	sent: [
		{
			sentAt: new Date(NOW.getTime() - 120 * HOUR),
			templateName: "One week out",
			templateId: 1,
			messageTemplate:
				"Hi, this is a reminder that $CLIENT_FNAME has an appointment $LOCATION next week.",
		},
		{
			sentAt: new Date(NOW.getTime() - 48 * HOUR),
			templateName: "Questionnaire check",
			templateId: 2,
			messageTemplate:
				"Please finish $CLIENT_FNAME's questionnaires before the appointment.",
		},
	],
	pending: [
		{
			scheduledFor: new Date(NOW.getTime() - 2 * HOUR),
			quietAdjusted: true,
			templateName: "Two days out",
			condition: null,
			messageTemplate: "$CLIENT_FNAME's appointment is in two days $LOCATION.",
			isOverdue: true,
		},
		{
			scheduledFor: new Date(NOW.getTime() + 24 * HOUR),
			quietAdjusted: false,
			templateName: "Day before",
			condition: "Only if forms are incomplete",
			messageTemplate: "$CLIENT_FNAME's appointment is tomorrow $LOCATION.",
			isOverdue: false,
		},
	],
});
