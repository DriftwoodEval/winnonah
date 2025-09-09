import { type InferSelectModel, inArray } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import z from "zod";
import { env } from "~/env";
import type { FullClientInfo, PunchClient } from "~/lib/types";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { clients } from "~/server/db/schema";

const getPunchData = async (accessToken: string, refreshToken: string) => {
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

export const googleRouter = createTRPCRouter({
  getPunch: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
      throw new Error("No access token or refresh token");
    }
    return getPunchData(
      ctx.session.user.accessToken,
      ctx.session.user.refreshToken
    );
  }),

  getClientFromPunch: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
        throw new Error("No access token or refresh token");
      }
      const data = await getPunchData(
        ctx.session.user.accessToken,
        ctx.session.user.refreshToken
      );
      return data.find((client) => client["Client ID"] === input);
    }),
});
