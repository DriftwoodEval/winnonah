import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import z from "zod";
import { fetchWithCache, invalidateCache } from "~/lib/cache";
import {
	createAvailabilityEvent,
	findDuplicateIdFolders,
	getAvailabilityEvents,
	getClientFromPunchData,
	getPunchData,
	renameDriveFolder,
	updatePunchData,
} from "~/lib/google";
import { logger } from "~/lib/logger";
import type { Client } from "~/lib/types";
import { hasPermission } from "~/lib/utils";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { clients, offices } from "~/server/db/schema";

const log = logger.child({ module: "GoogleApi" });

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
			if (!hasPermission(ctx.session.user.permissions, "clients:drive")) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
				});
			}

			log.info(
				{ user: ctx.session.user.email, request: input },
				"Adding client ID to folder",
			);

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

			log.info(
				{ user: ctx.session.user.email, request: input },
				"Removing client ID from folder",
			);

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

			log.info(
				{ user: ctx.session.user.email, request: input },
				"Updating questionnaire status",
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
					}`,
				);
			}
		}),

	// Google Calendar
	createAvailability: protectedProcedure
		.input(availabilitySchema)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.session) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
				});
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
			}),
		)
		.query(async ({ ctx, input }) => {
			if (!ctx.session) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
				});
			}

			const events = await getAvailabilityEvents(
				ctx.session,
				input.startDate,
				input.endDate,
			);

			if (!events) {
				return [];
			}

			type CalendarEvent = (typeof events)[number];

			const allEvents: (CalendarEvent & { start: Date; end: Date })[] =
				events.map((e) => ({
					...e,
					start: new Date(e.start as string | Date),
					end: new Date(e.end as string | Date),
				}));

			const officeEvents = allEvents.filter((event) => !event.isUnavailability);
			const outOfOfficeEvents = allEvents.filter(
				(event) => event.isUnavailability,
			);

			if (outOfOfficeEvents.length === 0) {
				allEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
				return allEvents;
			}

			outOfOfficeEvents.sort((a, b) => a.start.getTime() - b.start.getTime());

			const mergedOutOfOffice = outOfOfficeEvents.reduce<
				typeof outOfOfficeEvents
			>((acc, current) => {
				const last = acc[acc.length - 1];
				if (!last || current.start.getTime() > last.end.getTime()) {
					acc.push(current);
				} else if (current.end.getTime() > last.end.getTime()) {
					last.end = current.end;
				}
				return acc;
			}, []);

			const finalAvailability: typeof officeEvents = [];

			for (const officeEvent of officeEvents) {
				let currentEventParts = [officeEvent];

				for (const oooEvent of mergedOutOfOffice) {
					const newParts: typeof officeEvents = [];
					for (const part of currentEventParts) {
						const overlap =
							part.start.getTime() < oooEvent.end.getTime() &&
							part.end.getTime() > oooEvent.start.getTime();

						if (!overlap) {
							newParts.push(part);
							continue;
						}

						if (part.start.getTime() < oooEvent.start.getTime()) {
							newParts.push({
								...part,
								id: `${part.id}-1`,
								end: oooEvent.start,
							});
						}

						if (part.end.getTime() > oooEvent.end.getTime()) {
							newParts.push({
								...part,
								id: `${part.id}-2`,
								start: oooEvent.end,
							});
						}
					}
					currentEventParts = newParts;
				}

				finalAvailability.push(...currentEventParts);
			}

			const result = [...finalAvailability, ...outOfOfficeEvents];
			result.sort((a, b) => a.start.getTime() - b.start.getTime());

			return result;
		}),

	verifyPunchClients: protectedProcedure.query(async ({ ctx }) => {
		if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
			throw new Error("No access token or refresh token");
		}

		const punchData = await getPunchData(ctx.session);

		const clientsNotInDb = punchData.filter(
			(client) => typeof client.id !== "number",
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

		const punchClients = await getPunchData(ctx.session);
		const punchClientIds = new Set(
			punchClients
				.map((c) => c["Client ID"])
				.filter(
					(id): id is string => typeof id === "string" && id.trim() !== "",
				)
				.map((id) => parseInt(id, 10))
				.filter((id) => !Number.isNaN(id)),
		);

		const activeDbClients = await ctx.db
			.select()
			.from(clients)
			.where(eq(clients.status, true));

		const missingClients = activeDbClients.filter(
			(client) => !punchClientIds.has(client.id),
		);

		return missingClients;
	}),
});
