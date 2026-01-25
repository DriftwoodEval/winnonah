import { TRPCError } from "@trpc/server";
import { and, eq, notInArray } from "drizzle-orm";
import z from "zod";
import { fetchWithCache, invalidateCache } from "~/lib/cache";
import { ALLOWED_ASD_ADHD_VALUES, TEST_NAMES } from "~/lib/constants";
import {
	findDuplicateIdFolders,
	getClientFromPunchData,
	getPunchData,
	renameDriveFolder,
	updatePunchData,
} from "~/lib/google";
import { hasPermission } from "~/lib/utils";
import { getPriorityInfo } from "~/server/api/routers/client";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { clients } from "~/server/db/schema";

const CACHE_KEY_DUPLICATES = "google:drive:duplicate-ids";

export const googleRouter = createTRPCRouter({
	// Google Drive
	addIdToFolder: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				folderId: z.string(),
			}),
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

			ctx.logger.info(input, "Adding client ID to Drive folder");

			await renameDriveFolder(ctx.session, input.folderId, input.id);

			await invalidateCache(ctx, CACHE_KEY_DUPLICATES);
		}),

	removeIdFromFolder: protectedProcedure
		.input(
			z.object({
				folderId: z.string(),
			}),
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

			ctx.logger.info(input, "Removing client ID from Drive folder");

			await renameDriveFolder(ctx.session, input.folderId, null);

			await invalidateCache(ctx, CACHE_KEY_DUPLICATES);
		}),

	findDuplicates: protectedProcedure.query(async ({ ctx }) => {
		if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
			throw new Error("No access token or refresh token");
		}

		return fetchWithCache(
			ctx,
			CACHE_KEY_DUPLICATES,
			async () => {
				return findDuplicateIdFolders(ctx.session);
			},
			60 * 60 * 12, // 12 hours
			true, // Enable timestamp
		);
	}),

	invalidateDuplicatesCache: protectedProcedure.mutation(async ({ ctx }) => {
		await invalidateCache(ctx, CACHE_KEY_DUPLICATES);
		return { success: true, key: CACHE_KEY_DUPLICATES };
	}),

	// Google Sheets
	getPunch: protectedProcedure.query(async ({ ctx }) => {
		if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
			throw new Error("No access token or refresh token");
		}
		return getPunchData(ctx.session, ctx.redis);
	}),

	getClientFromPunch: protectedProcedure
		.input(z.string())
		.query(async ({ ctx, input }) => {
			if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
				throw new Error("No access token or refresh token");
			}

			const punchClient = await getClientFromPunchData(
				ctx.session,
				input,
				ctx.redis,
			);

			if (!punchClient) {
				return null;
			}

			return punchClient;
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
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
				throw new Error("No access token or refresh token");
			}

			// Validate that at least one field is being updated
			if (input.daSent === undefined && input.evalSent === undefined) {
				throw new Error("At least one field must be provided for update");
			}

			ctx.logger.info(input, "Updating questionnaire status");

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
					}`,
				);
			}
		}),

	setAsdAdhd: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
				asdAdhd: z.enum(ALLOWED_ASD_ADHD_VALUES),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
				throw new Error("No access token or refresh token");
			}

			ctx.logger.info(input, "Updating ASD/ADHD status");

			try {
				await updatePunchData(ctx.session, input.clientId.toString(), {
					asdAdhd: input.asdAdhd,
				});
			} catch (error) {
				console.error(
					"Error updating ASD/ADHD status in Google Sheets:",
					error,
				);

				throw new Error(
					`Failed to update ASD/ADHD status in Google Sheets: ${
						error instanceof Error ? error.message : "Unknown error"
					}`,
				);
			}

			await ctx.db
				.update(clients)
				.set({ asdAdhd: input.asdAdhd })
				.where(eq(clients.id, input.clientId));

			return {
				success: true,
				message: "ASD/ADHD status updated successfully",
			};
		}),

	verifyPunchClients: protectedProcedure.query(async ({ ctx }) => {
		if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
			throw new Error("No access token or refresh token");
		}

		const punchData = await getPunchData(ctx.session, ctx.redis);

		const clientsNotInDb = punchData.filter(
			(client) =>
				typeof client.id !== "number" &&
				!TEST_NAMES.includes(
					(client["Client Name"] as (typeof TEST_NAMES)[number]) ?? "",
				),
		);
		const inactiveClients = punchData.filter(
			(client) => typeof client.id === "number" && client.status === false,
		);

		return { clientsNotInDb, inactiveClients };
	}),

	getMissingFromPunchlist: protectedProcedure.query(async ({ ctx }) => {
		if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
			throw new Error("No access token or refresh token");
		}

		const punchClients = await getPunchData(ctx.session, ctx.redis);
		const punchClientIds = new Set(
			punchClients
				.map((c) => c["Client ID"])
				.filter(
					(id): id is string => typeof id === "string" && id.trim() !== "",
				)
				.map((id) => parseInt(id, 10))
				.filter((id) => !Number.isNaN(id)),
		);

		const { orderBySQL } = getPriorityInfo();

		const activeDbClients = await ctx.db
			.select()
			.from(clients)
			.where(
				and(
					eq(clients.status, true),
					notInArray(clients.fullName, TEST_NAMES as unknown as string[]),
				),
			)
			.orderBy(...orderBySQL);

		const missingClients = activeDbClients.filter(
			(client) => !punchClientIds.has(client.id),
		);

		return missingClients;
	}),
});
