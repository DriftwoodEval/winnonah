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
export const renameDriveFolder = async (
  accessToken: string,
  refreshToken: string,
  folderId: string,
  clientId: string
) => {
  const { AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET } = env;
  const oauth2Client = new OAuth2Client({
    clientId: AUTH_GOOGLE_ID,
    clientSecret: AUTH_GOOGLE_SECRET,
  });
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  const driveApi = google.drive({ version: "v3", auth: oauth2Client });

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
export const getPunchData = async (
  accessToken: string,
  refreshToken: string
) => {
  const { AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, PUNCHLIST_ID, PUNCHLIST_RANGE } =
    env;
  const oauth2Client = new OAuth2Client({
    clientId: AUTH_GOOGLE_ID,
    clientSecret: AUTH_GOOGLE_SECRET,
  });
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  const sheetsApi = google.sheets({ version: "v4", auth: oauth2Client });
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

// Google Sheets
export const updatePunchData = async (
  accessToken: string,
  refreshToken: string,
  clientId: string,
  updates: { daSent?: boolean; evalSent?: boolean }
) => {
  const { AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, PUNCHLIST_ID, PUNCHLIST_RANGE } =
    env;

  const oauth2Client = new OAuth2Client({
    clientId: AUTH_GOOGLE_ID,
    clientSecret: AUTH_GOOGLE_SECRET,
  });
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  const sheetsApi = google.sheets({ version: "v4", auth: oauth2Client });

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

export const getClientFromPunchData = async (
  accessToken: string,
  refreshToken: string,
  id: string
) => {
  const data = await getPunchData(accessToken, refreshToken);
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

  return google.calendar({ version: "v3", auth: oauth2Client });
}

interface AvailabilityEvent {
  summary: string;
  start: Date;
  end: Date;
  isRecurring: boolean;
  recurrenceRule?: string;
  isUnavailability: boolean;
}

export async function createAvailabilityEvent(
  session: Session,
  eventData: AvailabilityEvent
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

  const event: any = {
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
  officeKey?: string;
}

export async function getAvailabilityEvents(
  session: Session,
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> {
  const calendar = getCalendarClient(session);

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: startDate.toISOString(),
    timeMax: endDate.toISOString(),
    singleEvents: true, // Expand recurring events
    orderBy: "startTime",
  });

  const events = response.data.items ?? [];

  const allOffices = await db.query.offices.findMany({});
  const nameToKeyMap = new Map(
    allOffices.map((office) => [office.prettyName, office.key])
  );

  const officeRegex = /Available\s*-\s*(.*)/i;

  return events
    .filter(
      (event) =>
        event.summary?.includes("Available") ||
        event.summary?.includes("Out of Office")
    )
    .map((event) => {
      const startDateTime = event.start?.dateTime || event.start?.date;
      const endDateTime = event.end?.dateTime || event.end?.date;
      const isOOO = event.eventType === "outOfOffice";

      let extractedOfficeKey: string | undefined;

      if (event.summary && !isOOO) {
        const match = event.summary.match(officeRegex);
        if (match?.[1]) {
          const officeName = match[1].trim();
          // 2. Try to map the extracted name to a known key
          extractedOfficeKey = nameToKeyMap.get(officeName);
        }
      }

      return {
        id: event.id,
        summary: event.summary,
        start: startDateTime ? new Date(startDateTime) : new Date(),
        end: endDateTime ? new Date(endDateTime) : new Date(),
        isUnavailability: isOOO,
        officeKey: extractedOfficeKey,
      };
    });
}
