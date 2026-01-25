import { TRPCError } from "@trpc/server";
import { and, eq, notInArray } from "drizzle-orm";
import { distance as levDistance } from "fastest-levenshtein";
import z from "zod";
import { fetchWithCache, invalidateCache } from "~/lib/cache";
import { ALLOWED_ASD_ADHD_VALUES, TEST_NAMES } from "~/lib/constants";
import {
	createAvailabilityEvent,
	deleteAvailabilityEvent,
	findDuplicateIdFolders,
	getAvailabilityEvents,
	getCalendarClient,
	getClientFromPunchData,
	getPunchData,
	mergeOutOfOfficeEvents,
	renameDriveFolder,
	splitAvailabilityByOOO,
	updateAvailabilityEvent,
	updatePunchData,
} from "~/lib/google";
import type { Client } from "~/lib/models";
import { getPriorityInfo } from "~/server/api/routers/client";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import { clients, offices } from "~/server/db/schema";

const CACHE_KEY_DUPLICATES = "google:drive:duplicate-ids";

const availabilitySchema = z.object({
	startDate: z.date(),
	endDate: z.date(),
	isRecurring: z.boolean(),
	recurrenceRule: z.string().optional(),
	isUnavailability: z.boolean(),
	officeKeys: z.array(z.string()).optional(),
});

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

	// Google Calendar
	createAvailability: protectedProcedure
		.input(availabilitySchema)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
				throw new Error("No access token or refresh token");
			}

			let summary: string;

			if (input.isUnavailability) {
				summary = "Out of office";
			} else {
				const allOffices = await ctx.db.select().from(offices);
				const officeMap = new Map(allOffices.map((o) => [o.key, o.prettyName]));

				if (!input.officeKeys || input.officeKeys.length === 0) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "At least one office must be selected if not unavailable.",
					});
				}

				const selectedOfficeNames = input.officeKeys
					.map((key) => officeMap.get(key))
					.filter((name): name is string => name !== undefined);

				if (selectedOfficeNames.length === 0) {
					summary = "Available - Location Unknown";
				} else if (selectedOfficeNames.length === 1) {
					summary = `Available - ${selectedOfficeNames[0]}`;
				} else {
					summary = `Available - ${selectedOfficeNames.join(", ")}`;
				}
			}

			const event = await createAvailabilityEvent(ctx.session, {
				summary: summary,
				start: input.startDate,
				end: input.endDate,
				isRecurring: input.isRecurring,
				recurrenceRule: input.recurrenceRule,
				isUnavailability: input.isUnavailability,
			});

			return {
				success: true,
				message: "Availability event created successfully.",
				eventId: event.id,
			};
		}),

	getAvailability: protectedProcedure
		.input(
			z.object({
				startDate: z.date(),
				endDate: z.date(),
				raw: z.boolean().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			if (!ctx.session) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
				});
			}

			let events = await getAvailabilityEvents(
				ctx.session,
				input.startDate,
				input.endDate,
			);

			if (!events) {
				return [];
			}

			// If raw is requested, we might want recurrence info for recurring instances
			if (input.raw) {
				const calendarApi = getCalendarClient(ctx.session);
				// Group by recurringEventId to minimize API calls
				const recurringEventIds = [
					...new Set(
						events
							.map((e) => e.recurringEventId)
							.filter((id): id is string => !!id),
					),
				];

				const masterRecurrenceMap = new Map<string, string[]>();

				for (const masterId of recurringEventIds) {
					try {
						const masterEvent = await calendarApi.events.get({
							calendarId: "primary",
							eventId: masterId,
						});
						if (masterEvent.data.recurrence) {
							masterRecurrenceMap.set(masterId, masterEvent.data.recurrence);
						}
					} catch (error) {
						ctx.logger.error(
							{ error, masterId },
							"Error fetching master event recurrence",
						);
					}
				}

				events = events.map((event) => {
					if (event.recurringEventId && !event.recurrence) {
						return {
							...event,
							recurrence: masterRecurrenceMap.get(event.recurringEventId),
						};
					}
					return event;
				});

				return events.sort((a, b) => a.start.getTime() - b.start.getTime());
			}

			const officeEvents = events.filter((event) => !event.isUnavailability);
			const outOfOfficeEvents = events.filter(
				(event) => event.isUnavailability,
			);

			if (outOfOfficeEvents.length === 0) {
				return [...officeEvents].sort(
					(a, b) => a.start.getTime() - b.start.getTime(),
				);
			}

			const finalAvailability = splitAvailabilityByOOO(
				officeEvents,
				outOfOfficeEvents,
			);

			const mergedOOO = mergeOutOfOfficeEvents(outOfOfficeEvents);

			const result = [...finalAvailability, ...mergedOOO];
			result.sort((a, b) => a.start.getTime() - b.start.getTime());

			return result;
		}),

	updateAvailability: protectedProcedure
		.input(
			availabilitySchema.extend({
				eventId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.session) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
				});
			}

			try {
				let summary: string;

				if (input.isUnavailability) {
					summary = "Out of office";
				} else {
					const allOffices = await ctx.db.select().from(offices);
					const officeMap = new Map(
						allOffices.map((o) => [o.key, o.prettyName]),
					);

					if (!input.officeKeys || input.officeKeys.length === 0) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message:
								"At least one office must be selected if not unavailable.",
						});
					}

					const selectedOfficeNames = input.officeKeys
						.map((key) => officeMap.get(key))
						.filter((name): name is string => name !== undefined);

					if (selectedOfficeNames.length === 0) {
						summary = "Available - Location Unknown";
					} else if (selectedOfficeNames.length === 1) {
						summary = `Available - ${selectedOfficeNames[0]}`;
					} else {
						summary = `Available - ${selectedOfficeNames.join(", ")}`;
					}
				}

				const event = await updateAvailabilityEvent(
					ctx.session,
					input.eventId,
					{
						summary: summary,
						start: input.startDate,
						end: input.endDate,
						isRecurring: input.isRecurring,
						recurrenceRule: input.recurrenceRule,
						isUnavailability: input.isUnavailability,
					},
				);

				return {
					success: true,
					message: "Availability event updated successfully.",
					eventId: event.id,
				};
			} catch (error) {
				ctx.logger.error({ error, input }, "Error in updateAvailability");
				if (error instanceof TRPCError) throw error;
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error ? error.message : "Unknown error occurred",
				});
			}
		}),

	deleteAvailability: protectedProcedure
		.input(z.object({ eventId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			if (!ctx.session) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
				});
			}

			try {
				await deleteAvailabilityEvent(ctx.session, input.eventId);

				return {
					success: true,
					message: "Availability event deleted successfully.",
				};
			} catch (error) {
				ctx.logger.error({ error, input }, "Error in deleteAvailability");
				if (error instanceof TRPCError) throw error;
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error ? error.message : "Unknown error occurred",
				});
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
