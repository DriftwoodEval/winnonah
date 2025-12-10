import { TRPCError } from "@trpc/server";
import { eq, type InferSelectModel, inArray } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import { google, type sheets_v4 } from "googleapis";
import z from "zod";
import { env } from "~/env";
import { logger } from "~/lib/logger";
import type { FullClientInfo, PunchClient } from "~/lib/types";
import { hasPermission } from "~/lib/utils";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { clients } from "~/server/db/schema";
import type { Client } from "~/server/lib/types";

const log = logger.child({ module: "GoogleApi" });

const renameFolder = async (
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

const updatePunchData = async (
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

const getClientFromPunchData = async (
  accessToken: string,
  refreshToken: string,
  id: string
) => {
  const data = await getPunchData(accessToken, refreshToken);
  return data.find((client) => client["Client ID"] === id);
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

      const punchClient = await getClientFromPunchData(
        ctx.session.user.accessToken,
        ctx.session.user.refreshToken,
        input
      );

      if (!punchClient) {
        return null;
      }

      return punchClient;
    }),

  getFor: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
      throw new Error("No access token or refresh token");
    }

    const punchClient = await getClientFromPunchData(
      ctx.session.user.accessToken,
      ctx.session.user.refreshToken,
      input
    );

    if (!punchClient?.For) {
      return null;
    }

    const allowedValues = [
      "ASD",
      "ADHD",
      "ASD+ADHD",
      "ASD+LD",
      "ADHD+LD",
      "LD",
    ];
    if (allowedValues.includes(punchClient.For)) {
      await ctx.db
        .update(clients)
        .set({ asdAdhd: punchClient.For as Client["asdAdhd"] })
        .where(eq(clients.id, Number(input)));
    } else {
      throw new Error(`Invalid value for asdAdhd: ${punchClient.For}`);
    }

    return punchClient.For;
  }),

  getLang: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
        throw new Error("No access token or refresh token");
      }

      const punchClient = await getClientFromPunchData(
        ctx.session.user.accessToken,
        ctx.session.user.refreshToken,
        input
      );

      if (!punchClient?.Language || punchClient.Language === "") {
        return false;
      } else {
        await ctx.db
          .update(clients)
          .set({ interpreter: true })
          .where(eq(clients.id, Number(input)));
        return true;
      }
    }),

  getQsSent: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
        throw new Error("No access token or refresh token");
      }

      const punchClient = await getClientFromPunchData(
        ctx.session.user.accessToken,
        ctx.session.user.refreshToken,
        input
      );

      if (!punchClient) {
        return null;
      }

      const qsSent = {
        "DA Qs Sent": punchClient["DA Qs Sent"] === "TRUE",
        "EVAL Qs Sent": punchClient["EVAL Qs Sent"] === "TRUE",
      };

      return qsSent;
    }),

  setQsSent: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        daSent: z.boolean().optional(),
        evalSent: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
        throw new Error("No access token or refresh token");
      }

      // Validate that at least one field is being updated
      if (input.daSent === undefined && input.evalSent === undefined) {
        throw new Error("At least one field must be provided for update");
      }

      log.info(
        { user: ctx.session.user.email, request: input },
        "Updating questionnaire status"
      );

      try {
        await updatePunchData(
          ctx.session.user.accessToken,
          ctx.session.user.refreshToken,
          input.id,
          {
            daSent: input.daSent,
            evalSent: input.evalSent,
          }
        );

        return {
          success: true,
          message: "Questionnaire status updated successfully",
        };
      } catch (error) {
        console.error("Error updating questionnaire status:", error);
        throw new Error(
          `Failed to update questionnaire status: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }),

  addIdToFolder: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        folderId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
        throw new Error("No access token or refresh token");
      }
      if (!hasPermission(ctx.session.user.permissions, "clients:drive")) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
        });
      }

      log.info(
        { user: ctx.session.user.email, request: input },
        "Adding client ID to folder"
      );

      await renameFolder(
        ctx.session.user.accessToken,
        ctx.session.user.refreshToken,
        input.folderId,
        input.id
      );
    }),
});
