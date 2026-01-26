import { drive } from "@googleapis/drive";
import { sheets, type sheets_v4 } from "@googleapis/sheets";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import type { Session } from "next-auth";
import { env } from "~/env";

import { db } from "~/server/db";
import {
	clients,
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

	const folder = await driveApi.files.get({
		fileId: folderId,
		fields: "name",
	});

	const currentFolderName = folder.data.name;
	const regex = /\[\d+\]/g;

	if (clientId === null) {
		const updatedFolderName = currentFolderName?.replace(regex, "").trim();
		if (updatedFolderName !== currentFolderName) {
			await driveApi.files.update({
				fileId: folderId,
				requestBody: {
					name: updatedFolderName,
				},
			});
		}
	} else {
		const baseName =
			newName ?? currentFolderName?.replace(regex, "").trim() ?? "";
		const updatedFolderName = `${baseName} [${clientId}]`;

		if (updatedFolderName !== currentFolderName) {
			await driveApi.files.update({
				fileId: folderId,
				requestBody: {
					name: updatedFolderName,
				},
			});
		}
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

export const getPunchData = async (session: Session) => {
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

export const syncPunchData = async (session: Session) => {
	const allPunchData = await getPunchData(session);

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
		primaryPayer: string | null;
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

	// Find the first blank row (where Client ID at index 1 is empty or whitespace)
	let targetRowIndex = rows.findIndex(
		(row) => !row[1] || row[1].toString().trim() === "",
	);

	if (targetRowIndex === -1) {
		// If no blank row found in the existing range, append after the last row
		targetRowIndex = rows.length;
	}

	const nameIndex = 0;
	const idIndex = headers.indexOf("Client ID");
	const forIndex = headers.indexOf("For");
	const primaryPayerIndex = headers.indexOf("Primary Payer");

	if (idIndex === -1 || forIndex === -1 || primaryPayerIndex === -1) {
		throw new Error(
			"Required columns (Client ID, For, Primary Payer) not found in Punchlist",
		);
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
	updateRequests.push({
		range: `${String.fromCharCode(65 + primaryPayerIndex)}${rowNumber}`,
		values: [[client.primaryPayer ?? ""]],
	});

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
			notInArray(clients.fullName, TEST_NAMES as unknown as string[]),
		),
	});

	return activeDbClients.filter((client) => !punchClientIds.has(client.id));
};
