import { eq, isNotNull } from "drizzle-orm";
import { distance as levDistance } from "fastest-levenshtein";
import z from "zod";
import { env } from "~/env";
import { fetchWithCache, invalidateCache } from "~/lib/cache";
import { ALLOWED_ASD_ADHD_VALUES, TEST_NAMES } from "~/lib/constants";
import {
	findDuplicateIdFolders,
	getMissingFromPunchlistData,
	getPunchData,
	renameDriveFolder,
	updatePunchData,
} from "~/lib/google";
import type { Client } from "~/lib/models";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import { clients, users } from "~/server/db/schema";

const CACHE_KEY_DUPLICATES = "google:drive:duplicate-ids";
const CACHE_KEY_PUNCHLIST = "google:sheets:punchlist";
const CACHE_KEY_MISSING_PUNCHLIST = "google:sheets:missing-punchlist";

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
		return fetchWithCache(
			ctx,
			CACHE_KEY_PUNCHLIST,
			() => getPunchData(ctx.session),
			60, // 1 minute
		);
	}),

	getClientFromPunch: protectedProcedure
		.input(z.string())
		.query(async ({ ctx, input }) => {
			if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
				throw new Error("No access token or refresh token");
			}

			const punchData = await fetchWithCache(
				ctx,
				CACHE_KEY_PUNCHLIST,
				() => getPunchData(ctx.session),
				60,
			);

			return punchData.find((client) => client["Client ID"] === input) ?? null;
		}),

	getQsSent: protectedProcedure
		.input(z.string())
		.query(async ({ ctx, input }) => {
			if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
				throw new Error("No access token or refresh token");
			}

			const punchData = await fetchWithCache(
				ctx,
				CACHE_KEY_PUNCHLIST,
				() => getPunchData(ctx.session),
				60,
			);

			const punchClient = punchData.find(
				(client) => client["Client ID"] === input,
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

				await invalidateCache(
					ctx,
					CACHE_KEY_PUNCHLIST,
					CACHE_KEY_MISSING_PUNCHLIST,
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

				await invalidateCache(
					ctx,
					CACHE_KEY_PUNCHLIST,
					CACHE_KEY_MISSING_PUNCHLIST,
				);
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

				await invalidateCache(
					ctx,
					CACHE_KEY_PUNCHLIST,
					CACHE_KEY_MISSING_PUNCHLIST,
				);
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

				await invalidateCache(
					ctx,
					CACHE_KEY_PUNCHLIST,
					CACHE_KEY_MISSING_PUNCHLIST,
				);

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

		const punchData = await fetchWithCache(
			ctx,
			CACHE_KEY_PUNCHLIST,
			() => getPunchData(ctx.session),
			60,
		);
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

		// Find duplicate client IDs
		const idCounts = new Map<string, number>();
		for (const client of punchData) {
			const id = client["Client ID"];
			if (id) {
				idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
			}
		}

		const duplicateIds = Array.from(idCounts.entries())
			.filter(([_, count]) => count > 1)
			.map(([id]) => id);

		const duplicateIdClients = duplicateIds.map((id) => {
			const count = idCounts.get(id) ?? 0;
			const client = punchData.find((c) => c["Client ID"] === id);
			return {
				...client,
				duplicateCount: count,
			};
		});

		return {
			clientsNotInDb: clientsWithSuggestions,
			inactiveClients,
			duplicateIdClients,
		};
	}),

	getMissingFromPunchlist: protectedProcedure.query(async ({ ctx }) => {
		if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
			throw new Error("No access token or refresh token");
		}

		return fetchWithCache(
			ctx,
			CACHE_KEY_MISSING_PUNCHLIST,
			() => getMissingFromPunchlistData(ctx.session),
			60,
		);
	}),

	getDashboardData: protectedProcedure.query(async ({ ctx }) => {
		if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
			throw new Error("No access token or refresh token");
		}

		const [punchClients, missingClients] = await Promise.all([
			fetchWithCache(
				ctx,
				CACHE_KEY_PUNCHLIST,
				() => getPunchData(ctx.session),
				60,
			),
			fetchWithCache(
				ctx,
				CACHE_KEY_MISSING_PUNCHLIST,
				() => getMissingFromPunchlistData(ctx.session),
				60,
			),
		]);

		return {
			punchClients,
			missingClients,
		};
	}),

	getFolders: protectedProcedure
		.input(z.object({ parentId: z.string() }))
		.query(async ({ input, ctx }) => {
			const cookieHeader = ctx.headers.get("cookie") ?? "";

			const response = await fetch(`${env.PY_API}/folders/${input.parentId}`, {
				headers: {
					Cookie: cookieHeader,
				},
			});

			if (!response.ok) {
				console.error(
					`FastAPI error: ${response.status} ${response.statusText}`,
				);
				throw new Error("FastAPI server error");
			}

			const data = (await response.json()) as {
				folders: { id: string; name: string }[];
			};
			return data.folders;
		}),

	getWriterFolder: protectedProcedure
		.input(z.object({ parentId: z.string() }))
		.query(async ({ input, ctx }) => {
			const cookieHeader = ctx.headers.get("cookie") ?? "";

			const response = await fetch(
				`${env.PY_API}/folders/writer/${input.parentId}`,
				{
					headers: {
						Cookie: cookieHeader,
					},
				},
			);

			if (!response.ok) {
				if (response.status === 404) {
					return null;
				}
				console.error(
					`FastAPI error: ${response.status} ${response.statusText}`,
				);
				throw new Error("FastAPI server error");
			}

			const data = (await response.json()) as {
				id: string;
				name: string;
			};
			return data;
		}),

	claimTopFolder: protectedProcedure
		.input(z.object({ sourceId: z.string(), destId: z.string() }))
		.mutation(async ({ input, ctx }) => {
			const cookieHeader = ctx.headers.get("cookie") ?? "";

			const userName = ctx.session.user.name;
			if (!userName) throw new Error("No user name found in session");

			const user = await ctx.db.query.users.findFirst({
				where: eq(users.id, ctx.session.user.id),
			});

			if (user?.claimedReportFolder) {
				throw new Error(
					`You already have a report claimed: "${user.claimedReportFolder.name}". It must be approved before claiming another.`,
				);
			}

			const response = await fetch(`${env.PY_API}/folders/claim`, {
				method: "POST",
				headers: { "Content-Type": "application/json", Cookie: cookieHeader },
				body: JSON.stringify({
					source_parent_id: input.sourceId,
					destination_parent_id: input.destId,
				}),
			});

			const data = (await response.json()) as {
				status: string;
				folder_claimed: string;
				folder_id: string;
				moved_into: string;
				client_id: string;
				detail?: string;
			};

			if (!response.ok) {
				throw new Error(data.detail || "Failed to claim folder");
			}

			await ctx.db
				.update(users)
				.set({
					claimedReportFolder: {
						name: data.folder_claimed,
						id: data.folder_id,
					},
				})
				.where(eq(users.id, ctx.session.user.id));

			return {
				folder_claimed: data.folder_claimed,
				moved_into: data.moved_into,
			};
		}),

	approveReport: protectedProcedure
		.input(z.object({ userId: z.string() }))
		.mutation(async ({ input, ctx }) => {
			assertPermission(ctx.session.user, "reports:approve");

			await ctx.db
				.update(users)
				.set({ claimedReportFolder: null })
				.where(eq(users.id, input.userId));

			return { success: true };
		}),

	getClaimedFolder: protectedProcedure.query(async ({ ctx }) => {
		const user = await ctx.db.query.users.findFirst({
			where: eq(users.id, ctx.session.user.id),
			columns: {
				claimedReportFolder: true,
			},
		});

		return user?.claimedReportFolder ?? null;
	}),

	getClaimedReports: protectedProcedure.query(async ({ ctx }) => {
		assertPermission(ctx.session.user, "reports:approve");

		const claimedUsers = await ctx.db.query.users.findMany({
			where: isNotNull(users.claimedReportFolder),
			columns: {
				id: true,
				name: true,
				email: true,
				claimedReportFolder: true,
			},
		});

		return claimedUsers;
	}),
});
