import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import z from "zod";
import {
  getClientFromPunchData,
  getPunchData,
  renameDriveFolder,
  updatePunchData,
} from "~/lib/google";
import { logger } from "~/lib/logger";
import type { Client } from "~/lib/types";
import { hasPermission } from "~/lib/utils";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { clients } from "~/server/db/schema";

const log = logger.child({ module: "GoogleApi" });

export const googleRouter = createTRPCRouter({
  // Google Drive
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

      await renameDriveFolder(ctx.session, input.folderId, input.id);
    }),

  // Google Sheets
  getPunch: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
      throw new Error("No access token or refresh token");
    }
    return getPunchData(ctx.session);
  }),

  getClientFromPunch: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
        throw new Error("No access token or refresh token");
      }

      const punchClient = await getClientFromPunchData(ctx.session, input);

      if (!punchClient) {
        return null;
      }

      return punchClient;
    }),

  getFor: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
      throw new Error("No access token or refresh token");
    }

    const punchClient = await getClientFromPunchData(ctx.session, input);

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

      const punchClient = await getClientFromPunchData(ctx.session, input);

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

      const punchClient = await getClientFromPunchData(ctx.session, input);

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
        await updatePunchData(ctx.session, input.id, {
          daSent: input.daSent,
          evalSent: input.evalSent,
        });

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
});
