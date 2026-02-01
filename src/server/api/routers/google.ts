import { and, eq, notInArray } from "drizzle-orm";
import { distance as levDistance } from "fastest-levenshtein";
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
import type { Client } from "~/lib/models";
import { getPriorityInfo } from "~/server/api/routers/client";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
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
			assertPermission(ctx.session.user, "clients:drive");

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
			assertPermission(ctx.session.user, "clients:drive");

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

			const punchClient = await getClientFromPunchData(
				ctx.session,
				input,
				ctx.redis,
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

				await invalidateCache(ctx, "google:sheets:punchlist");

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
			assertPermission(ctx.session.user, "clients:asdadhd");

			if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
				throw new Error("No access token or refresh token");
			}

			ctx.logger.info(input, "Updating ASD/ADHD status");

			try {
				await updatePunchData(ctx.session, input.clientId.toString(), {
					asdAdhd: input.asdAdhd,
				});

				await invalidateCache(ctx, "google:sheets:punchlist");
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

	setProtocolsScanned: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
				protocolsScanned: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:protocolsscanned");
			if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
				throw new Error("No access token or refresh token");
			}

			ctx.logger.info(input, "Updating Protocols Scanned");

			try {
				await updatePunchData(ctx.session, input.clientId.toString(), {
					protocolsScanned: input.protocolsScanned,
				});

				await invalidateCache(ctx, "google:sheets:punchlist");
			} catch (error) {
				console.error(
					"Error updating Protocols Scanned in Google Sheets:",
					error,
				);

				throw new Error(
					`Failed to update Protocols Scanned in Google Sheets: ${
						error instanceof Error ? error.message : "Unknown error"
					}`,
				);
			}

			return {
				success: true,
				message: "Protocols Scanned updated successfully",
			};
		}),

	updatePunchId: protectedProcedure
		.input(
			z.object({
				currentId: z.string(),
				newId: z.number(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
				throw new Error("No access token or refresh token");
			}

			ctx.logger.info(input, "Updating punchlist client ID");

			try {
				await updatePunchData(ctx.session, input.currentId, {
					newId: input.newId,
				});

				await invalidateCache(ctx, "google:sheets:punchlist");

				return {
					success: true,
					message: "Punchlist client ID updated successfully",
				};
			} catch (error) {
				console.error("Error updating punchlist client ID:", error);
				throw new Error(
					`Failed to fix punchlist client ID: ${
						error instanceof Error ? error.message : "Unknown error"
					}`,
				);
			}
		}),

	verifyPunchClients: protectedProcedure.query(async ({ ctx }) => {
		if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
			throw new Error("No access token or refresh token");
		}

		const punchData = await getPunchData(ctx.session, ctx.redis);
		const dbClients = await ctx.db.select().from(clients);

		const clientsNotInDb = punchData.filter(
			(client) =>
				typeof client.id !== "number" &&
				!TEST_NAMES.includes(
					(client["Client Name"] as (typeof TEST_NAMES)[number]) ?? "",
				),
		);

		const clientsWithSuggestions = clientsNotInDb.map((punchClient) => {
			const punchName = punchClient["Client Name"]?.toLowerCase() ?? "";
			if (!punchName) return { ...punchClient, suggestions: [] as Client[] };

			const suggestions = dbClients
				.map((client) => {
					const legalName = `${client.firstName.toLowerCase()} ${client.lastName.toLowerCase()}`;
					const fullName = client.preferredName
						? `${client.preferredName} ${client.lastName}`.toLowerCase()
						: client.fullName;

					const distance = Math.min(
						levDistance(punchName, legalName),
						levDistance(punchName, fullName),
					);

					const isMatch =
						distance <= 3 ||
						punchName.includes(legalName) ||
						fullName.includes(punchName) ||
						(client.preferredName &&
							(punchName.includes(fullName) || fullName.includes(punchName)));

					return { ...client, distance, isMatch };
				})
				.filter((c) => c.isMatch)
				.sort((a, b) => a.distance - b.distance)
				.slice(0, 5);

			return { ...punchClient, suggestions };
		});

		const inactiveClients = punchData.filter(
			(client) => typeof client.id === "number" && client.status === false,
		);

		return { clientsNotInDb: clientsWithSuggestions, inactiveClients };
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
