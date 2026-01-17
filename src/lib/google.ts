import { TRPCError } from "@trpc/server";
import { eq, type InferSelectModel, inArray } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import { google, type sheets_v4 } from "googleapis";
import type Redis from "ioredis";
import type { Session } from "next-auth";
import { env } from "~/env";
import type { FullClientInfo, PunchClient } from "~/lib/types";
import { db } from "~/server/db";
import { clients } from "~/server/db/schema";

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

	return google.drive({ version: "v3", auth: oauth2Client });
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

	return google.sheets({ version: "v4", auth: oauth2Client });
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

	const normalizedSheetData: PunchClient[] = rows
		.filter((row) => typeof row[1] === "string" && row[1].trim() !== "")
		.map((row) => {
			const punchClient: Partial<PunchClient> = {};
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
				const key = header as keyof PunchClient;
				if (key) {
					punchClient[key] = row[index + 1] as PunchClient[keyof PunchClient];
				}
			});
			return punchClient as PunchClient;
		});

	const clientIds = normalizedSheetData
		.map((client) => parseInt(client["Client ID"] ?? "", 10))
		.filter((id) => !Number.isNaN(id));

	const dbClients = await db
		.select()
		.from(clients)
		.where(inArray(clients.id, clientIds));

	const dbClientMap = new Map<number, InferSelectModel<typeof clients>>(
		dbClients.map((client) => [client.id, client]),
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
	updates: { daSent?: boolean; evalSent?: boolean },
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

	if (daSentIndex === -1 || evalSentIndex === -1) {
		throw new Error("DA Qs Sent or EVAL Qs Sent column not found in Punchlist");
	}

	const updateRequests: sheets_v4.Schema$ValueRange[] = [];

	if (updates.daSent !== undefined) {
		const cellAddress = `${String.fromCharCode(65 + daSentIndex)}${
			clientRowIndex + 2
		}`; // +2 because of 0-index + header row
		updateRequests.push({
			range: cellAddress,
			values: [[updates.daSent ? "TRUE" : "FALSE"]],
		});
	}

	if (updates.evalSent !== undefined) {
		const cellAddress = `${String.fromCharCode(65 + evalSentIndex)}${
			clientRowIndex + 2
		}`;
		updateRequests.push({
			range: cellAddress,
			values: [[updates.evalSent ? "TRUE" : "FALSE"]],
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

export const ALLOWED_ASD_ADHD_VALUES = [
	"ASD",
	"ADHD",
	"ASD+ADHD",
	"ASD+LD",
	"ADHD+LD",
	"LD",
] as const;

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
		const updates: Partial<InferSelectModel<typeof clients>> = {};

		if (
			client.For &&
			(ALLOWED_ASD_ADHD_VALUES as unknown as string[]).includes(client.For) &&
			client.For !== client.asdAdhd
		) {
			updates.asdAdhd = client.For as InferSelectModel<
				typeof clients
			>["asdAdhd"];
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
