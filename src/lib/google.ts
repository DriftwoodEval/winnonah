import { calendar, type calendar_v3 } from "@googleapis/calendar";
import { drive } from "@googleapis/drive";
import { sheets, type sheets_v4 } from "@googleapis/sheets";
import { and, eq, inArray, lt, not, notInArray, sql } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import type { Session } from "next-auth";
import { env } from "~/env";
import { logger } from "~/lib/logger";

import { db } from "~/server/db";
import {
	appointments,
	clients,
	externalRecordRequests,
	externalRecords,
	failures,
	questionnaires,
} from "~/server/db/schema";
import {
	ALLOWED_ASD_ADHD_VALUES,
	type PUNCH_SCHEMA,
	TEST_NAMES,
} from "./constants";
import type { Client, FullClientInfo } from "./models";

async function googleApiCall<T>(
	api: string,
	endpoint: string,
	message: string,
	fn: () => Promise<T>,
): Promise<T> {
	const start = Date.now();
	try {
		return await fn();
	} finally {
		logger.debug(
			{ duration_ms: Date.now() - start, external_api: api, endpoint },
			message,
		);
	}
}

// Google Drive
export function getDriveClient(session: Session) {
	if (!session.user.accessToken || !session.user.refreshToken) {
		throw new Error("Missing access token for Google Calendar API.");
	}

	const { AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET } = env;
	const oauth2Client = new OAuth2Client({
		clientId: AUTH_GOOGLE_ID,
		clientSecret: AUTH_GOOGLE_SECRET,
	});
	oauth2Client.setCredentials({
		access_token: session.user.accessToken,
		refresh_token: session.user.refreshToken,
	});

	return drive({ version: "v3", auth: oauth2Client });
}

export const renameDriveFolder = async (
	session: Session,
	folderId: string,
	clientId: string | null,
	newName?: string,
) => {
	const driveApi = getDriveClient(session);

	const folder = await googleApiCall(
		"google-drive",
		"files.get",
		"Get Drive folder",
		() => driveApi.files.get({ fileId: folderId, fields: "name" }),
	);

	const currentFolderName = folder.data.name;
	const regex = /\[\d+\]/g;

	if (clientId === null) {
		const updatedFolderName = currentFolderName?.replace(regex, "").trim();
		if (updatedFolderName !== currentFolderName) {
			await googleApiCall(
				"google-drive",
				"files.update",
				"Rename Drive folder",
				() =>
					driveApi.files.update({
						fileId: folderId,
						requestBody: { name: updatedFolderName },
					}),
			);
		}
	} else {
		const baseName =
			newName ?? currentFolderName?.replace(regex, "").trim() ?? "";
		const updatedFolderName = `${baseName} [${clientId}]`;

		if (updatedFolderName !== currentFolderName) {
			await googleApiCall(
				"google-drive",
				"files.update",
				"Rename Drive folder",
				() =>
					driveApi.files.update({
						fileId: folderId,
						requestBody: { name: updatedFolderName },
					}),
			);
		}
	}
};

// Google Sheets
export function getSheetsClient(session: Session) {
	if (!session.user.accessToken || !session.user.refreshToken) {
		throw new Error("Missing access token for Google Calendar API.");
	}

	const { AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET } = env;
	const oauth2Client = new OAuth2Client({
		clientId: AUTH_GOOGLE_ID,
		clientSecret: AUTH_GOOGLE_SECRET,
	});
	oauth2Client.setCredentials({
		access_token: session.user.accessToken,
		refresh_token: session.user.refreshToken,
	});

	return sheets({ version: "v4", auth: oauth2Client });
}

export const getPunchData = async (session: Session) => {
	const { PUNCHLIST_ID, PUNCHLIST_RANGE } = env;
	const sheetsApi = getSheetsClient(session);

	const response = await googleApiCall(
		"google-sheets",
		"spreadsheets.values.get",
		"Get punchlist",
		() =>
			sheetsApi.spreadsheets.values.get({
				spreadsheetId: PUNCHLIST_ID,
				range: PUNCHLIST_RANGE,
				valueRenderOption: "UNFORMATTED_VALUE",
			}),
	);

	const data = response.data.values ?? [];
	const headers = data[0] ?? [];
	const rows = data.slice(1);

	// Columns that store dates as Google Sheets serial numbers.
	// With UNFORMATTED_VALUE, date cells return a number (days since Dec 30 1899).
	const DATE_COLUMNS = new Set(["DA Scheduled", "EVAL date", "PA Expiration"]);

	const sheetValueToString = (
		key: string,
		val: unknown,
	): string | undefined => {
		if (val === null || val === undefined || val === "") return undefined;
		if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
		if (typeof val === "number") {
			if (DATE_COLUMNS.has(key)) {
				// Google Sheets serial → UTC date. 25569 = days from Dec 30 1899 to Unix epoch.
				const d = new Date((val - 25569) * 86400 * 1000);
				return d.toISOString().slice(0, 10);
			}
			return String(val);
		}
		return String(val);
	};

	const normalizedSheetData: PUNCH_SCHEMA[] = rows
		.filter((row) => {
			const id = row[1];
			return id !== undefined && id !== null && String(id).trim() !== "";
		})
		.map((row) => {
			const punchClient: Partial<PUNCH_SCHEMA> = {};
			punchClient["Client ID"] = String(row[1]);
			const rawName = String(row[0] ?? "");
			let name = rawName
				.toLowerCase()
				.split(" ")
				.map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
				.join(" ");
			name = name
				.split("-")
				.map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
				.join("-");
			name = name
				.split("(")
				.map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
				.join("(");
			name = name
				.split('"')
				.map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
				.join('"');

			punchClient["Client Name"] = name;

			headers.slice(1).forEach((header, index) => {
				const key = header as keyof PUNCH_SCHEMA;
				if (key) {
					punchClient[key] = sheetValueToString(
						key,
						row[index + 1],
					) as PUNCH_SCHEMA[keyof PUNCH_SCHEMA];
				}
			});
			return punchClient as PUNCH_SCHEMA;
		});

	const clientIds = normalizedSheetData
		.map((client) => parseInt(client["Client ID"] ?? "", 10))
		.filter((id) => !Number.isNaN(id));

	const [dbClients, allFailures, allQuestionnaires, past96130Appts] =
		await Promise.all([
			db
				.select({
					client: clients,
					hasExternalRecordsNote: sql<boolean>`CASE WHEN ${externalRecords.content} IS NOT NULL THEN TRUE ELSE FALSE END`,
					externalRecordsRequestedDate: sql<string | null>`(
					SELECT MAX(${externalRecordRequests.requestedDate})
					FROM ${externalRecordRequests}
					WHERE ${externalRecordRequests.clientId} = ${clients.id}
					AND ${externalRecordRequests.requestedDate} IS NOT NULL
				)`,
				})
				.from(clients)
				.leftJoin(externalRecords, eq(clients.id, externalRecords.clientId))
				.where(inArray(clients.id, clientIds)),
			db.select().from(failures).where(inArray(failures.clientId, clientIds)),
			db
				.select()
				.from(questionnaires)
				.where(inArray(questionnaires.clientId, clientIds)),
			db
				.selectDistinct({ clientId: appointments.clientId })
				.from(appointments)
				.where(
					and(
						inArray(appointments.clientId, clientIds),
						eq(appointments.cpt, "96130"),
						eq(appointments.cancelled, false),
						eq(appointments.placeholder, false),
						lt(appointments.startTime, new Date()),
					),
				),
		]);

	const past96130ClientIds = new Set(past96130Appts.map((a) => a.clientId));

	const failureMap = new Map<number, (typeof failures.$inferSelect)[]>();
	allFailures.forEach((failure) => {
		let clientFailures = failureMap.get(failure.clientId);
		if (!clientFailures) {
			clientFailures = [];
			failureMap.set(failure.clientId, clientFailures);
		}
		clientFailures.push(failure);
	});

	const questionnaireMap = new Map<
		number,
		(typeof questionnaires.$inferSelect)[]
	>();
	allQuestionnaires.forEach((q) => {
		let clientQs = questionnaireMap.get(q.clientId);
		if (!clientQs) {
			clientQs = [];
			questionnaireMap.set(q.clientId, clientQs);
		}
		clientQs.push(q);
	});

	const dbClientMap = new Map<number, FullClientInfo>(
		dbClients.map(
			({ client, hasExternalRecordsNote, externalRecordsRequestedDate }) => [
				client.id,
				{
					...client,
					hasExternalRecordsNote,
					externalRecordsRequestedDate,
					failures: failureMap.get(client.id) ?? [],
					questionnaires: questionnaireMap.get(client.id) ?? [],
					hasPast96130Appt: past96130ClientIds.has(client.id),
				} as FullClientInfo,
			],
		),
	);

	const finalData: FullClientInfo[] = normalizedSheetData.map((sheetClient) => {
		const clientId = parseInt(sheetClient["Client ID"] ?? "", 10);
		const dbInfo = dbClientMap.get(clientId);

		if (dbInfo) {
			// Merge the sheet data and database info
			return { ...dbInfo, ...sheetClient } as FullClientInfo;
		}

		// If no match is found, just return the sheet info
		return sheetClient as FullClientInfo;
	});

	return finalData;
};

export const updatePunchData = async (
	session: Session,
	clientId: string,
	updates: {
		daSent?: boolean;
		evalSent?: boolean;
		daDone?: boolean;
		evalDone?: boolean;
		asdAdhd?: string;
		language?: string;
		protocolsScanned?: boolean;
		newId?: number;
	},
) => {
	const { PUNCHLIST_ID, PUNCHLIST_RANGE } = env;
	const sheetsApi = getSheetsClient(session);

	const response = await googleApiCall(
		"google-sheets",
		"spreadsheets.values.get",
		"Get punchlist",
		() =>
			sheetsApi.spreadsheets.values.get({
				spreadsheetId: PUNCHLIST_ID,
				range: PUNCHLIST_RANGE,
			}),
	);

	const data = response.data.values ?? [];
	const headers = data[0] ?? [];
	const rows = data.slice(1);

	const clientRowIndex = rows.findIndex((row) => row[1] === clientId);

	if (clientRowIndex === -1) {
		throw new Error(`Client ID ${clientId} not found in Punchlist`);
	}

	const daSentIndex = headers.indexOf("DA Qs Sent");
	const evalSentIndex = headers.indexOf("EVAL Qs Sent");
	const daDoneIndex = headers.indexOf("DA Qs Done");
	const evalDoneIndex = headers.indexOf("EVAL Qs Done");
	const forIndex = headers.indexOf("For");
	const languageIndex = headers.indexOf("Language");
	const protocolsScannedIndex = headers.indexOf("Protocols scanned?");

	const updateRequests: sheets_v4.Schema$ValueRange[] = [];

	if (updates.newId !== undefined) {
		const cellAddress = `B${clientRowIndex + 2}`; // Column B is index 1 (Client ID)
		updateRequests.push({
			range: cellAddress,
			values: [[updates.newId.toString()]],
		});
	}

	if (updates.daSent !== undefined) {
		if (daSentIndex === -1) {
			throw new Error("DA Qs Sent column not found in Punchlist");
		}
		const cellAddress = `${String.fromCharCode(65 + daSentIndex)}${
			clientRowIndex + 2
		}`; // +2 because of 0-index + header row
		updateRequests.push({
			range: cellAddress,
			values: [[updates.daSent ? "TRUE" : "FALSE"]],
		});
	}

	if (updates.evalSent !== undefined) {
		if (evalSentIndex === -1) {
			throw new Error("EVAL Qs Sent column not found in Punchlist");
		}
		const cellAddress = `${String.fromCharCode(65 + evalSentIndex)}${
			clientRowIndex + 2
		}`;
		updateRequests.push({
			range: cellAddress,
			values: [[updates.evalSent ? "TRUE" : "FALSE"]],
		});
	}

	if (updates.daDone !== undefined) {
		if (daDoneIndex === -1) {
			throw new Error("DA Qs Done column not found in Punchlist");
		}
		const cellAddress = `${String.fromCharCode(65 + daDoneIndex)}${
			clientRowIndex + 2
		}`;
		updateRequests.push({
			range: cellAddress,
			values: [[updates.daDone ? "TRUE" : "FALSE"]],
		});
	}

	if (updates.evalDone !== undefined) {
		if (evalDoneIndex === -1) {
			throw new Error("EVAL Qs Done column not found in Punchlist");
		}
		const cellAddress = `${String.fromCharCode(65 + evalDoneIndex)}${
			clientRowIndex + 2
		}`;
		updateRequests.push({
			range: cellAddress,
			values: [[updates.evalDone ? "TRUE" : "FALSE"]],
		});
	}

	if (updates.asdAdhd !== undefined) {
		if (forIndex === -1) {
			throw new Error("For column not found in Punchlist");
		}
		const cellAddress = `${String.fromCharCode(65 + forIndex)}${
			clientRowIndex + 2
		}`;
		updateRequests.push({
			range: cellAddress,
			values: [[updates.asdAdhd]],
		});
	}

	if (updates.language !== undefined) {
		if (languageIndex === -1) {
			throw new Error("Language column not found in Punchlist");
		}
		const cellAddress = `${String.fromCharCode(65 + languageIndex)}${
			clientRowIndex + 2
		}`;
		const languageValue =
			updates.language === "English" || !updates.language
				? ""
				: updates.language;
		updateRequests.push({
			range: cellAddress,
			values: [[languageValue]],
		});
	}

	if (updates.protocolsScanned !== undefined) {
		if (protocolsScannedIndex === -1) {
			throw new Error("Protocols scanned? column not found in Punchlist");
		}
		const cellAddress = `${String.fromCharCode(65 + protocolsScannedIndex)}${
			clientRowIndex + 2
		}`;
		updateRequests.push({
			range: cellAddress,
			values: [[updates.protocolsScanned ? "TRUE" : "FALSE"]],
		});
	}

	if (updateRequests.length > 0) {
		await googleApiCall(
			"google-sheets",
			"spreadsheets.values.batchUpdate",
			"Update punchlist",
			() =>
				sheetsApi.spreadsheets.values.batchUpdate({
					spreadsheetId: PUNCHLIST_ID,
					requestBody: {
						valueInputOption: "USER_ENTERED",
						data: updateRequests,
					},
				}),
		);
	}

	return true;
};

export const syncPunchData = async (session: Session) => {
	const allPunchData = await getPunchData(session);

	const updatePromises: Promise<unknown>[] = [];

	for (const client of allPunchData) {
		const updates: Partial<Client> = {};

		if (
			client.For &&
			(ALLOWED_ASD_ADHD_VALUES as unknown as string[]).includes(client.For) &&
			client.For !== client.asdAdhd
		) {
			updates.asdAdhd = client.For as Client["asdAdhd"];
		}

		if (
			client.Language &&
			client.Language.trim() !== "" &&
			client.Language.trim() !== client.language
		) {
			updates.language = client.Language.trim();
		}

		if (Object.keys(updates).length > 0) {
			updatePromises.push(
				db.update(clients).set(updates).where(eq(clients.id, client.id)),
			);
		}
	}

	await Promise.all(updatePromises);
};

export const getClientFromPunchData = async (session: Session, id: string) => {
	const data = await getPunchData(session);
	return data.find((client) => client["Client ID"] === id);
};

export const pushToPunch = async (
	session: Session,
	client: {
		id: number;
		fullName: string;
		asdAdhd: string | null;
		language?: string | null;
		primaryPayer: string | null;
		secondaryPayer: string | null;
		privatePay?: boolean;
		location: string | null;
		daQsNeeded?: boolean;
		evalQsNeeded?: boolean;
	},
) => {
	const { PUNCHLIST_ID, PUNCHLIST_RANGE } = env;
	const sheetsApi = getSheetsClient(session);

	const response = await googleApiCall(
		"google-sheets",
		"spreadsheets.values.get",
		"Get punchlist",
		() =>
			sheetsApi.spreadsheets.values.get({
				spreadsheetId: PUNCHLIST_ID,
				range: PUNCHLIST_RANGE,
			}),
	);

	const data = response.data.values ?? [];
	const headers = data[0] ?? [];
	const rows = data.slice(1);

	const nameIndex = 0;
	const idIndex = headers.indexOf("Client ID");
	const forIndex = headers.indexOf("For");
	const languageIndex = headers.indexOf("Language");
	const primaryPayerIndex = headers.indexOf("Primary Payer");
	const secondaryPayerIndex = headers.indexOf("Secondary Payer");
	const paExpirationIndex = headers.indexOf("PA Expiration");
	const locationIndex = headers.indexOf("Location");
	const daQsNeededIndex = headers.indexOf("DA Qs Needed");
	const evalQsNeededIndex = headers.indexOf("EVAL Qs Needed");

	if (idIndex === -1 || forIndex === -1 || primaryPayerIndex === -1) {
		throw new Error(
			"Required columns (Client ID, For, Primary Payer) not found in Punchlist",
		);
	}

	// Find the first blank row (where Client Name at index 0 and Client ID at detected index are both empty or whitespace)
	let targetRowIndex = rows.findIndex(
		(row) =>
			(!row[nameIndex] || row[nameIndex].toString().trim() === "") &&
			(!row[idIndex] || row[idIndex].toString().trim() === ""),
	);

	if (targetRowIndex === -1) {
		// If no blank row found in the existing range, append after the last row
		targetRowIndex = rows.length;
	}

	const updateRequests: sheets_v4.Schema$ValueRange[] = [];

	const rowNumber = targetRowIndex + 2; // +1 for 0-index, +1 for header row

	updateRequests.push({
		range: `${String.fromCharCode(65 + nameIndex)}${rowNumber}`,
		values: [[client.fullName]],
	});
	updateRequests.push({
		range: `${String.fromCharCode(65 + idIndex)}${rowNumber}`,
		values: [[client.id.toString()]],
	});
	updateRequests.push({
		range: `${String.fromCharCode(65 + forIndex)}${rowNumber}`,
		values: [[client.asdAdhd ?? ""]],
	});

	if (languageIndex !== -1) {
		const languageValue =
			client.language === "English" || !client.language ? "" : client.language;
		updateRequests.push({
			range: `${String.fromCharCode(65 + languageIndex)}${rowNumber}`,
			values: [[languageValue]],
		});
	}

	updateRequests.push({
		range: `${String.fromCharCode(65 + primaryPayerIndex)}${rowNumber}`,
		values: [[client.primaryPayer ?? ""]],
	});

	if (secondaryPayerIndex !== -1) {
		updateRequests.push({
			range: `${String.fromCharCode(65 + secondaryPayerIndex)}${rowNumber}`,
			values: [[client.secondaryPayer ?? ""]],
		});
	}

	if (paExpirationIndex !== -1 && client.privatePay) {
		updateRequests.push({
			range: `${String.fromCharCode(65 + paExpirationIndex)}${rowNumber}`,
			values: [["PP"]],
		});
	}

	if (locationIndex !== -1) {
		updateRequests.push({
			range: `${String.fromCharCode(65 + locationIndex)}${rowNumber}`,
			values: [[client.location ?? ""]],
		});
	}

	if (daQsNeededIndex !== -1) {
		updateRequests.push({
			range: `${String.fromCharCode(65 + daQsNeededIndex)}${rowNumber}`,
			values: [[client.daQsNeeded ? "TRUE" : "FALSE"]],
		});
	}

	if (evalQsNeededIndex !== -1) {
		updateRequests.push({
			range: `${String.fromCharCode(65 + evalQsNeededIndex)}${rowNumber}`,
			values: [[client.evalQsNeeded ? "TRUE" : "FALSE"]],
		});
	}

	await sheetsApi.spreadsheets.values.batchUpdate({
		spreadsheetId: PUNCHLIST_ID,
		requestBody: {
			valueInputOption: "USER_ENTERED",
			data: updateRequests,
		},
	});

	return true;
};

export const getMissingFromPunchlistData = async (session: Session) => {
	const punchClients = await getPunchData(session);
	const punchClientIds = new Set(
		punchClients
			.map((c) => c["Client ID"])
			.filter((id): id is string => typeof id === "string" && id.trim() !== "")
			.map((id) => parseInt(id, 10))
			.filter((id) => !Number.isNaN(id)),
	);

	const activeDbClients = await db.query.clients.findMany({
		where: and(
			eq(clients.status, true),
			not(eq(sql`LENGTH(${clients.id})`, 5)),
			notInArray(
				sql`LOWER(${clients.fullName})`,
				TEST_NAMES.map((n) => n.toLowerCase()),
			),
		),
	});

	return activeDbClients.filter((client) => !punchClientIds.has(client.id));
};

// Google Calendar
export function getCalendarClient(session: Session) {
	if (!session.user.accessToken || !session.user.refreshToken) {
		throw new Error("Missing access token for Google Calendar API.");
	}

	const { AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET } = env;
	const oauth2Client = new OAuth2Client({
		clientId: AUTH_GOOGLE_ID,
		clientSecret: AUTH_GOOGLE_SECRET,
	});
	oauth2Client.setCredentials({
		access_token: session.user.accessToken,
		refresh_token: session.user.refreshToken,
	});

	return calendar({ version: "v3", auth: oauth2Client });
}

interface AvailabilityEvent {
	summary: string;
	start: Date;
	end: Date;
	isRecurring: boolean;
	recurrenceRule?: string;
	isUnavailability: boolean;
	isAllDay?: boolean;
}

interface Event {
	summary: string;
	start: { dateTime?: string; date?: string; timeZone: string };
	end: { dateTime?: string; date?: string; timeZone: string };
	eventType?: string;
	transparency?: string;
	recurrence?: string[];
}

export async function createAvailabilityEvent(
	session: Session,
	eventData: AvailabilityEvent,
) {
	const calendar = getCalendarClient(session);

	const formatDate = (date: Date) => {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	};

	const formatDateTime = (date: Date) => date.toISOString();

	const event: Event = {
		summary: eventData.summary,
		start: {
			timeZone: "America/New_York",
		},
		end: {
			timeZone: "America/New_York",
		},
	};

	if (eventData.isAllDay) {
		event.start.date = formatDate(eventData.start);
		// endDate is stored inclusive in the form; Google Calendar expects exclusive
		event.end.date = formatDate(new Date(eventData.end.getTime() + 86400000));
	} else {
		event.start.dateTime = formatDateTime(eventData.start);
		event.end.dateTime = formatDateTime(eventData.end);
	}

	if (eventData.isUnavailability) {
		event.eventType = "outOfOffice";
		event.transparency = "opaque";
	}

	if (eventData.isRecurring && eventData.recurrenceRule) {
		event.recurrence = [eventData.recurrenceRule];
	}

	const response = await googleApiCall(
		"google-calendar",
		"events.insert",
		"Create calendar event",
		() => calendar.events.insert({ calendarId: "primary", requestBody: event }),
	);

	return response.data;
}

interface CalendarEvent {
	id: string | null | undefined;
	summary: string | null | undefined;
	start: Date;
	end: Date;
	isUnavailability: boolean;
	isAllDay: boolean;
	officeKey?: string;
	officeKeys?: string[];
	recurrence?: string[];
	recurringEventId?: string | null;
}

const isMidnight = (date: Date) => {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/New_York",
		hour: "numeric",
		minute: "numeric",
		second: "numeric",
		hour12: false,
	}).formatToParts(date);

	const hour = parts.find((p) => p.type === "hour")?.value;
	const minute = parts.find((p) => p.type === "minute")?.value;
	const second = parts.find((p) => p.type === "second")?.value;

	return (hour === "00" || hour === "24") && minute === "00" && second === "00";
};

export function mergeOutOfOfficeEvents(events: CalendarEvent[]) {
	if (events.length === 0) return [];

	const sorted = [...events].sort(
		(a, b) => a.start.getTime() - b.start.getTime(),
	);

	return sorted.reduce<CalendarEvent[]>((acc, current) => {
		const last = acc[acc.length - 1];
		if (!last || current.start.getTime() > last.end.getTime()) {
			acc.push({ ...current });
		} else if (current.end.getTime() > last.end.getTime()) {
			last.end = current.end;
		}
		return acc;
	}, []);
}

export function splitAvailabilityByOOO(
	officeEvents: CalendarEvent[],
	oooEvents: CalendarEvent[],
) {
	const mergedOOO = mergeOutOfOfficeEvents(oooEvents);
	const finalAvailability: CalendarEvent[] = [];

	for (const officeEvent of officeEvents) {
		let currentEventParts = [officeEvent];

		for (const oooEvent of mergedOOO) {
			const newParts: CalendarEvent[] = [];
			for (const part of currentEventParts) {
				const overlap =
					part.start.getTime() < oooEvent.end.getTime() &&
					part.end.getTime() > oooEvent.start.getTime();

				if (!overlap) {
					newParts.push(part);
					continue;
				}

				if (part.start.getTime() < oooEvent.start.getTime()) {
					newParts.push({
						...part,
						id: `${part.id}-1`,
						end: oooEvent.start,
						isAllDay: false,
					});
				}

				if (part.end.getTime() > oooEvent.end.getTime()) {
					newParts.push({
						...part,
						id: `${part.id}-2`,
						start: oooEvent.end,
						isAllDay: false,
					});
				}
			}
			currentEventParts = newParts;
		}

		finalAvailability.push(...currentEventParts);
	}

	return finalAvailability;
}

export async function getAvailabilityEvents(
	session: Session,
	startDate: Date,
	endDate: Date,
): Promise<CalendarEvent[]> {
	const calendarApi = getCalendarClient(session);
	const allItems: calendar_v3.Schema$Event[] = [];
	let pageToken: string | undefined;

	do {
		const response = await googleApiCall(
			"google-calendar",
			"events.list",
			"List calendar events",
			() =>
				calendarApi.events.list({
					calendarId: "primary",
					timeMin: startDate.toISOString(),
					timeMax: endDate.toISOString(),
					singleEvents: true,
					orderBy: "startTime",
					pageToken: pageToken,
				}),
		);

		if (response.data.items) {
			allItems.push(...response.data.items);
		}

		pageToken = response.data.nextPageToken ?? undefined;
	} while (pageToken);

	const allOffices = await db.query.offices.findMany({});
	const nameToKeyMap = new Map(
		allOffices.map((office) => [office.prettyName, office.key]),
	);
	nameToKeyMap.set("Virtual", "Virtual");

	const officeRegex = /Available\s*-\s*(.*)/i;

	return allItems
		.filter(
			(event) =>
				event.summary?.match(/^Available\s*-\s*/i) ||
				event.eventType === "outOfOffice" ||
				event.summary?.toLowerCase().trim() === "out of office",
		)
		.map((event) => {
			const startDateTime = event.start?.dateTime || event.start?.date;
			const endDateTime = event.end?.dateTime || event.end?.date;
			const isOOO =
				event.eventType === "outOfOffice" ||
				event.summary?.toLowerCase().trim() === "out of office";

			const startDateObj = startDateTime ? new Date(startDateTime) : new Date();
			const endDateObj = endDateTime ? new Date(endDateTime) : new Date();

			const isAllDay =
				!!event.start?.date ||
				(!!event.start?.dateTime &&
					!!event.end?.dateTime &&
					isMidnight(startDateObj) &&
					isMidnight(endDateObj) &&
					startDateObj.getTime() < endDateObj.getTime());

			let extractedOfficeKeys: string[] = [];

			if (event.summary && !isOOO) {
				const match = event.summary.match(officeRegex);
				if (match?.[1]) {
					const officeNames = match[1].split(",").map((s) => s.trim());
					extractedOfficeKeys = officeNames
						.map((name) => nameToKeyMap.get(name))
						.filter((key): key is string => key !== undefined);
				}
			}

			return {
				id: event.id,
				summary: event.summary,
				start: startDateObj,
				end: endDateObj,
				isUnavailability: isOOO,
				isAllDay: isAllDay,
				officeKey: extractedOfficeKeys[0], // Keep for backward compatibility
				officeKeys: extractedOfficeKeys,
				recurrence: event.recurrence ?? undefined,
				recurringEventId: event.recurringEventId,
			};
		});
}

export async function updateAvailabilityEvent(
	session: Session,
	eventId: string,
	eventData: AvailabilityEvent,
) {
	const calendar = getCalendarClient(session);

	const formatDate = (date: Date) => {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	};

	const formatDateTime = (date: Date) => date.toISOString();

	const event: calendar_v3.Schema$Event = {
		summary: eventData.summary,
		start: eventData.isAllDay
			? {
					date: formatDate(eventData.start),
					timeZone: "America/New_York",
				}
			: {
					dateTime: formatDateTime(eventData.start),
					timeZone: "America/New_York",
				},
		end: eventData.isAllDay
			? {
					// endDate is stored inclusive in the form; Google Calendar expects exclusive
					date: formatDate(new Date(eventData.end.getTime() + 86400000)),
					timeZone: "America/New_York",
				}
			: {
					dateTime: formatDateTime(eventData.end),
					timeZone: "America/New_York",
				},
	};

	if (eventData.isUnavailability) {
		event.eventType = "outOfOffice";
		event.transparency = "opaque";
	} else {
		event.eventType = "default";
	}

	if (eventData.isRecurring && eventData.recurrenceRule) {
		event.recurrence = [eventData.recurrenceRule];
	} else if (!eventData.isRecurring) {
		// To remove recurrence from a master event, we must set it to null or []
		event.recurrence = [];
	}

	const response = await googleApiCall(
		"google-calendar",
		"events.patch",
		"Update calendar event",
		() =>
			calendar.events.patch({
				calendarId: "primary",
				eventId: eventId,
				requestBody: event,
			}),
	);

	return response.data;
}

export async function deleteAvailabilityEvent(
	session: Session,
	eventId: string,
) {
	const calendar = getCalendarClient(session);

	await googleApiCall(
		"google-calendar",
		"events.delete",
		"Delete calendar event",
		() => calendar.events.delete({ calendarId: "primary", eventId: eventId }),
	);

	return { success: true };
}
