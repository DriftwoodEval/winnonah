import { calendar, type calendar_v3 } from "@googleapis/calendar";
import { drive } from "@googleapis/drive";
import { sheets, type sheets_v4 } from "@googleapis/sheets";
import { TRPCError } from "@trpc/server";
import { eq, inArray, sql } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import type Redis from "ioredis";
import type { Session } from "next-auth";
import { env } from "~/env";

import { db } from "~/server/db";
import {
	clients,
	externalRecords,
	failures,
	questionnaires,
} from "~/server/db/schema";
import { ALLOWED_ASD_ADHD_VALUES, type PUNCH_SCHEMA } from "./constants";
import type { Client, FullClientInfo } from "./models";

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
) => {
	const driveApi = getDriveClient(session);

	const folder = await driveApi.files.get({
		fileId: folderId,
		fields: "name",
	});

	const folderName = folder.data.name;
	const regex = /\[\d+\]/g;
	if (clientId === null) {
		const newFolderName = folderName?.replace(regex, "");
		if (newFolderName !== folderName) {
			await driveApi.files.update({
				fileId: folderId,
				requestBody: {
					name: newFolderName,
				},
			});
		}
	} else if (folderName && regex.test(folderName)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${folderName} already has a client ID`,
		});
	} else {
		const newFolderName = `${folderName?.trim()} [${clientId}]`;
		await driveApi.files.update({
			fileId: folderId,
			requestBody: {
				name: newFolderName,
			},
		});
	}
};

interface DuplicateFolder {
	id: string;
	name: string;
	url?: string;
	isDbMatch: boolean;
}

interface DuplicateGroup {
	clientId: string;
	clientHash: string;
	clientFullName: string;
	folders: DuplicateFolder[];
}

export const findDuplicateIdFolders = async (session: Session) => {
	const driveApi = getDriveClient(session);

	const query =
		"mimeType = 'application/vnd.google-apps.folder' and name contains '[' and trashed = false";

	const duplicatesMap = new Map<string, DuplicateGroup["folders"]>();
	let pageToken: string | undefined;

	do {
		const response = await driveApi.files.list({
			q: query,
			pageSize: 1000,
			pageToken: pageToken,
			fields: "nextPageToken, files(id, name, webViewLink)",
		});

		const files = response.data.files || [];
		const idRegex = /\[(\d+)\]/;

		for (const file of files) {
			if (!file.name || !file.id) continue;

			const match = file.name.match(idRegex);
			if (match?.[1]) {
				const clientId = match[1];

				const folderData: Omit<DuplicateFolder, "isDbMatch"> = {
					id: file.id,
					name: file.name,
					url: file.webViewLink ?? undefined,
				};

				if (duplicatesMap.has(clientId)) {
					duplicatesMap.get(clientId)?.push(folderData as DuplicateFolder);
				} else {
					duplicatesMap.set(clientId, [folderData as DuplicateFolder]);
				}
			}
		}

		pageToken = response.data.nextPageToken ?? undefined;
	} while (pageToken);

	const allDuplicateClientIds = Array.from(duplicatesMap.keys()).map((id) =>
		Number(id),
	);

	if (allDuplicateClientIds.length === 0) {
		return [];
	}

	const dbClients = await db
		.select({
			id: clients.id,
			hash: clients.hash,
			fullName: clients.fullName,
			driveId: clients.driveId,
		})
		.from(clients)
		.where(inArray(clients.id, allDuplicateClientIds));

	const dbClientMap = new Map<string, (typeof dbClients)[number]>(
		dbClients.map((client) => [client.id.toString(), client]),
	);

	const results: DuplicateGroup[] = [];
	for (const [clientId, driveFolders] of duplicatesMap.entries()) {
		if (driveFolders.length > 1) {
			const dbInfo = dbClientMap.get(clientId);

			// We only return entries if we can successfully link them to a client in our DB
			if (dbInfo?.hash && dbInfo.fullName) {
				// Tag the folder that matches the driveId stored in the database
				const foldersWithDbMatch: DuplicateFolder[] = driveFolders.map(
					(folder) => ({
						...folder,
						isDbMatch: folder.id === dbInfo.driveId,
					}),
				);

				results.push({
					clientId: clientId,
					clientHash: dbInfo.hash,
					clientFullName: dbInfo.fullName,
					folders: foldersWithDbMatch,
				});
			}
		}
	}

	return results;
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

export const getPunchData = async (session: Session, redis?: Redis) => {
	const cacheKey = "google:sheets:punchlist";
	if (redis) {
		const cached = await redis.get(cacheKey);
		if (cached) {
			return JSON.parse(cached) as FullClientInfo[];
		}
	}

	const { PUNCHLIST_ID, PUNCHLIST_RANGE } = env;
	const sheetsApi = getSheetsClient(session);

	const response = await sheetsApi.spreadsheets.values.get({
		spreadsheetId: PUNCHLIST_ID,
		range: PUNCHLIST_RANGE,
	});

	const data = response.data.values ?? [];
	const headers = data[0] ?? [];
	const rows = data.slice(1);

	const normalizedSheetData: PUNCH_SCHEMA[] = rows
		.filter((row) => typeof row[1] === "string" && row[1].trim() !== "")
		.map((row) => {
			const punchClient: Partial<PUNCH_SCHEMA> = {};
			const clientId = row[1];
			punchClient["Client ID"] = clientId;
			const rawName = row[0];
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
					punchClient[key] = row[index + 1] as PUNCH_SCHEMA[keyof PUNCH_SCHEMA];
				}
			});
			return punchClient as PUNCH_SCHEMA;
		});

	const clientIds = normalizedSheetData
		.map((client) => parseInt(client["Client ID"] ?? "", 10))
		.filter((id) => !Number.isNaN(id));

	const [dbClients, allFailures, allQuestionnaires] = await Promise.all([
		db
			.select({
				client: clients,
				hasExternalRecordsNote: sql<boolean>`CASE WHEN ${externalRecords.content} IS NOT NULL THEN TRUE ELSE FALSE END`,
				externalRecordsRequestedDate: externalRecords.requested,
			})
			.from(clients)
			.leftJoin(externalRecords, eq(clients.id, externalRecords.clientId))
			.where(inArray(clients.id, clientIds)),
		db.select().from(failures).where(inArray(failures.clientId, clientIds)),
		db
			.select()
			.from(questionnaires)
			.where(inArray(questionnaires.clientId, clientIds)),
	]);

	const failureMap = new Map<number, (typeof failures.$inferSelect)[]>();
	allFailures.forEach((failure) => {
		const clientFailures = failureMap.get(failure.clientId) ?? [];
		failureMap.set(failure.clientId, [...clientFailures, failure]);
	});

	const questionnaireMap = new Map<
		number,
		(typeof questionnaires.$inferSelect)[]
	>();
	allQuestionnaires.forEach((q) => {
		const clientQs = questionnaireMap.get(q.clientId) ?? [];
		questionnaireMap.set(q.clientId, [...clientQs, q]);
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

	if (redis) {
		await redis.set(cacheKey, JSON.stringify(finalData), "EX", 60); // Cache for 1 minute
	}

	return finalData;
};

export const updatePunchData = async (
	session: Session,
	clientId: string,
	updates: {
		daSent?: boolean;
		evalSent?: boolean;
		asdAdhd?: string;
		protocolsScanned?: boolean;
		newId?: number;
	},
) => {
	const { PUNCHLIST_ID, PUNCHLIST_RANGE } = env;
	const sheetsApi = getSheetsClient(session);

	const response = await sheetsApi.spreadsheets.values.get({
		spreadsheetId: PUNCHLIST_ID,
		range: PUNCHLIST_RANGE,
	});

	const data = response.data.values ?? [];
	const headers = data[0] ?? [];
	const rows = data.slice(1);

	const clientRowIndex = rows.findIndex((row) => row[1] === clientId);

	if (clientRowIndex === -1) {
		throw new Error(`Client ID ${clientId} not found in Punchlist`);
	}

	const daSentIndex = headers.indexOf("DA Qs Sent");
	const evalSentIndex = headers.indexOf("EVAL Qs Sent");
	const forIndex = headers.indexOf("For");
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
		await sheetsApi.spreadsheets.values.batchUpdate({
			spreadsheetId: PUNCHLIST_ID,
			requestBody: {
				valueInputOption: "USER_ENTERED",
				data: updateRequests,
			},
		});
	}

	return true;
};

export const syncPunchData = async (session: Session, redis?: Redis) => {
	const cacheKey = "google:sheets:punchlist";
	if (redis) {
		const cached = await redis.get(cacheKey);
		if (cached) {
			return;
		}
	}

	const allPunchData = await getPunchData(session, redis);

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
			!client.interpreter
		) {
			updates.interpreter = true;
		}

		if (Object.keys(updates).length > 0) {
			await db.update(clients).set(updates).where(eq(clients.id, client.id));
		}
	}
};

export const getClientFromPunchData = async (
	session: Session,
	id: string,
	redis?: Redis,
) => {
	const data = await getPunchData(session, redis);
	return data.find((client) => client["Client ID"] === id);
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
}

interface Event {
	summary: string;
	start: { dateTime: string; timeZone: string };
	end: { dateTime: string; timeZone: string };
	eventType?: string;
	transparency?: string;
	recurrence?: string[];
}

export async function createAvailabilityEvent(
	session: Session,
	eventData: AvailabilityEvent,
) {
	const calendar = getCalendarClient(session);

	const formatDateTime = (date: Date) => {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		const hours = String(date.getHours()).padStart(2, "0");
		const minutes = String(date.getMinutes()).padStart(2, "0");
		const seconds = String(date.getSeconds()).padStart(2, "0");

		return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
	};

	const event: Event = {
		summary: eventData.summary,
		start: {
			dateTime: eventData.isRecurring
				? formatDateTime(eventData.start)
				: eventData.start.toISOString(),
			timeZone: "America/New_York",
		},
		end: {
			dateTime: eventData.isRecurring
				? formatDateTime(eventData.end)
				: eventData.end.toISOString(),
			timeZone: "America/New_York",
		},
	};

	if (eventData.isUnavailability) {
		event.eventType = "outOfOffice";
		event.transparency = "opaque";
	}

	if (eventData.isRecurring && eventData.recurrenceRule) {
		event.recurrence = [eventData.recurrenceRule];
	}

	const response = await calendar.events.insert({
		calendarId: "primary",
		requestBody: event,
	});

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
		const response = await calendarApi.events.list({
			calendarId: "primary",
			timeMin: startDate.toISOString(),
			timeMax: endDate.toISOString(),
			singleEvents: true, // Expand recurring events
			orderBy: "startTime",
			pageToken: pageToken,
		});

		if (response.data.items) {
			allItems.push(...response.data.items);
		}

		pageToken = response.data.nextPageToken ?? undefined;
	} while (pageToken);

	const allOffices = await db.query.offices.findMany({});
	const nameToKeyMap = new Map(
		allOffices.map((office) => [office.prettyName, office.key]),
	);

	const officeRegex = /Available\s*-\s*(.*)/i;

	return allItems
		.filter(
			(event) =>
				event.summary?.toLowerCase().includes("available") ||
				event.summary?.toLowerCase().includes("out of office"),
		)
		.map((event) => {
			const startDateTime = event.start?.dateTime || event.start?.date;
			const endDateTime = event.end?.dateTime || event.end?.date;
			const isOOO = event.eventType === "outOfOffice";

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

	const formatDateTime = (date: Date) => {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		const hours = String(date.getHours()).padStart(2, "0");
		const minutes = String(date.getMinutes()).padStart(2, "0");
		const seconds = String(date.getSeconds()).padStart(2, "0");

		return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
	};

	const event: calendar_v3.Schema$Event = {
		summary: eventData.summary,
		start: {
			dateTime: eventData.isRecurring
				? formatDateTime(eventData.start)
				: eventData.start.toISOString(),
			timeZone: "America/New_York",
		},
		end: {
			dateTime: eventData.isRecurring
				? formatDateTime(eventData.end)
				: eventData.end.toISOString(),
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

	const response = await calendar.events.patch({
		calendarId: "primary",
		eventId: eventId,
		requestBody: event,
	});

	return response.data;
}

export async function deleteAvailabilityEvent(
	session: Session,
	eventId: string,
) {
	const calendar = getCalendarClient(session);

	await calendar.events.delete({
		calendarId: "primary",
		eventId: eventId,
	});

	return { success: true };
}
