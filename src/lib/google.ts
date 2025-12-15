import { TRPCError } from "@trpc/server";
import { type InferSelectModel, inArray } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import { google, type sheets_v4 } from "googleapis";
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
  clientId: string
) => {
  const driveApi = getDriveClient(session);

  const folder = await driveApi.files.get({
    fileId: folderId,
    fields: "name",
  });

  const folderName = folder.data.name;
  const regex = /\[\d+\]/;
  if (folderName && regex.test(folderName)) {
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
    dbClients.map((client) => [client.id, client])
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
  updates: { daSent?: boolean; evalSent?: boolean }
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

export const getClientFromPunchData = async (session: Session, id: string) => {
  const data = await getPunchData(session);
  return data.find((client) => client["Client ID"] === id);
};
