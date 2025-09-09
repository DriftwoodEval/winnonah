import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import z from "zod";
import { env } from "~/env";
import type { PunchClient } from "~/lib/types";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

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

  const normalizedData: PunchClient[] = rows
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

  return normalizedData;
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
