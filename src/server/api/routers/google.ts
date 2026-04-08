import type { JSONContent } from "@tiptap/core";
import { TRPCError } from "@trpc/server";
import { differenceInMonths, differenceInYears } from "date-fns";
import { eq, isNotNull } from "drizzle-orm";
import { distance as levDistance } from "fastest-levenshtein";
import z from "zod";
import { env } from "~/env";
import { fetchWithCache, invalidateCache } from "~/lib/cache";
import { ALLOWED_ASD_ADHD_VALUES, TEST_NAMES } from "~/lib/constants";
import {
	createAvailabilityEvent,
	deleteAvailabilityEvent,
	getAvailabilityEvents,
	getCalendarClient,
	getMissingFromPunchlistData,
	getPunchData,
	mergeOutOfOfficeEvents,
	pushToPunch,
	renameDriveFolder,
	splitAvailabilityByOOO,
	updateAvailabilityEvent,
	updatePunchData,
} from "~/lib/google";
import type { Client } from "~/lib/models";
import type { DuplicateGroup } from "~/lib/types";
import { getDistanceSQL, getInsuranceShortName } from "~/lib/utils";
import {
	assertPermission,
	type Context,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import { clients, notes, offices, users } from "~/server/db/schema";
import { saveNoteInternal } from "./notes";

const CACHE_KEY_DUPLICATES = "google:drive:duplicate-ids";

const availabilitySchema = z.object({
	startDate: z.date(),
	endDate: z.date(),
	isRecurring: z.boolean(),
	recurrenceRule: z.string().optional(),
	isUnavailability: z.boolean(),
	isAllDay: z.boolean().optional(),
	officeKeys: z.array(z.string()).optional(),
});
const CACHE_KEY_PUNCHLIST = "google:sheets:punchlist";
const CACHE_KEY_MISSING_PUNCHLIST = "google:sheets:missing-punchlist";

const getPreviewData = async (ctx: Context, clientId: number) => {
	const client = await ctx.db.query.clients.findFirst({
		where: eq(clients.id, clientId),
	});

	if (!client) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Client not found",
		});
	}

	const allInsurances = await ctx.db.query.insurances.findMany({
		with: {
			aliases: true,
		},
	});

	const primaryInsurance = getInsuranceShortName(
		client.primaryInsurance,
		allInsurances,
	);

	const secondaryInsurance = getInsuranceShortName(
		client.secondaryInsurance,
		allInsurances,
	);

	const daQsNeeded = true;
	let evalQsNeeded = false;

	if (client.primaryInsurance) {
		const primaryInsuranceRecord = allInsurances.find(
			(i) =>
				i.shortName === primaryInsurance ||
				i.aliases.some((a) => a.name === client.primaryInsurance),
		);

		if (primaryInsuranceRecord?.appointmentsRequired === 1) {
			evalQsNeeded = true;
		}
	}

	// Calculate records needed status
	const ageInMonths = differenceInMonths(new Date(), new Date(client.dob));
	const ageInYears = differenceInYears(new Date(), new Date(client.dob));

	let recordsNeeded: "Needed" | "Not Needed" | null = null;
	if (ageInMonths >= 33 && ageInYears < 19) {
		recordsNeeded = "Needed";
	} else if (ageInYears >= 20) {
		recordsNeeded = "Not Needed";
	}

	let location: string | null = null;
	if (client.latitude && client.longitude) {
		const distanceExpr = getDistanceSQL(
			client.latitude,
			client.longitude,
			offices.latitude,
			offices.longitude,
		);

		const [closestOffice] = await ctx.db
			.select({
				key: offices.key,
				distance: distanceExpr,
			})
			.from(offices)
			.orderBy(distanceExpr)
			.limit(1);

		if (closestOffice) {
			if (closestOffice.key === "CHS") {
				location = "Charleston";
			} else if (closestOffice.key === "COL") {
				location = "C (Columbia)";
			} else {
				location = closestOffice.key;
			}
		}
	}

	return {
		id: client.id,
		fullName: client.fullName,
		asdAdhd: client.asdAdhd,
		primaryPayer: primaryInsurance,
		secondaryPayer: secondaryInsurance,
		location,
		daQsNeeded,
		evalQsNeeded,
		recordsNeeded,
	};
};

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
		const cookieHeader = ctx.headers.get("cookie") ?? "";

		return fetchWithCache(
			ctx,
			CACHE_KEY_DUPLICATES,
			async () => {
				const response = await fetch(`${env.PY_API}/folders/duplicates`, {
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

				return response.json() as Promise<DuplicateGroup[]>;
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
				ctx.logger.error(
					error,
					`Failed to update ASD/ADHD status in Google Sheets for client ${input.clientId}. This is normal if they are not on the punchlist.`,
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
				isAllDay: input.isAllDay,
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
						isAllDay: input.isAllDay,
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

	getPushPreview: protectedProcedure
		.input(z.number())
		.query(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:referral:pushtopunch");
			return getPreviewData(ctx, input);
		}),

	pushToPunch: protectedProcedure
		.input(z.number())
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:referral:pushtopunch");
			if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
				throw new Error("No access token or refresh token");
			}

			const client = await ctx.db.query.clients.findFirst({
				where: eq(clients.id, input),
			});

			if (!client) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Client not found",
				});
			}

			const previewData = await getPreviewData(ctx, input);

			ctx.logger.info({ clientId: input }, "Pushing client to Punchlist");

			// Append referral data to notes (separate logic)
			const referralData = client.referralData;
			if (referralData) {
				try {
					const currentNote = await ctx.db.query.notes.findFirst({
						where: eq(notes.clientId, input),
					});

					const referralContent: JSONContent[] = [];
					referralContent.push({ type: "paragraph" });
					referralContent.push({
						type: "paragraph",
						content: [
							{
								type: "text",
								text: "Referral Information",
								marks: [{ type: "bold" }],
							},
						],
					});

					if (referralData.notes) {
						referralContent.push({
							type: "paragraph",
							content: [
								{ type: "text", text: "Notes: ", marks: [{ type: "bold" }] },
								{ type: "text", text: referralData.notes },
							],
						});
					}

					if (referralData.schoolExplanation) {
						referralContent.push({
							type: "paragraph",
							content: [
								{
									type: "text",
									text: "School Notes: ",
									marks: [{ type: "bold" }],
								},
								{ type: "text", text: referralData.schoolExplanation },
							],
						});
					}

					if (referralData.locationPreference) {
						referralContent.push({
							type: "paragraph",
							content: [
								{
									type: "text",
									text: "Location Preference: ",
									marks: [{ type: "bold" }],
								},
								{ type: "text", text: referralData.locationPreference },
							],
						});
					}

					if (referralData.followedByBabyNet) {
						referralContent.push({
							type: "paragraph",
							content: [
								{
									type: "text",
									text: "BabyNet: ",
									marks: [{ type: "bold" }],
								},
								{ type: "text", text: referralData.followedByBabyNet },
							],
						});
					}

					if (referralData.otherNotes) {
						referralContent.push({
							type: "paragraph",
							content: [
								{
									type: "text",
									text: "Other Notes: ",
									marks: [{ type: "bold" }],
								},
								{ type: "text", text: referralData.otherNotes },
							],
						});
					}

					const existingContent = (currentNote?.content as JSONContent) || {
						type: "doc",
						content: [],
					};
					const finalContent = {
						type: "doc",
						content: [...(existingContent.content || []), ...referralContent],
					};

					await saveNoteInternal(ctx, {
						clientId: input,
						contentJson: finalContent,
					});
				} catch (e) {
					ctx.logger.error(e, "Failed to append referral data to notes");
				}
			}

			try {
				// Update recordsNeeded field appropriately based on age
				// if 2 years and 9 months (33 months) or older, and less than 19, set records needed
				// if 20 and up set records not needed
				const ageInMonths = differenceInMonths(
					new Date(),
					new Date(client.dob),
				);
				const ageInYears = differenceInYears(new Date(), new Date(client.dob));

				let recordsNeeded: "Needed" | "Not Needed" | null = null;
				if (ageInMonths >= 33 && ageInYears < 19) {
					recordsNeeded = "Needed";
				} else if (ageInYears >= 20) {
					recordsNeeded = "Not Needed";
				}

				if (recordsNeeded) {
					await ctx.db
						.update(clients)
						.set({ recordsNeeded })
						.where(eq(clients.id, input));
				}

				await pushToPunch(ctx.session, previewData);

				await invalidateCache(ctx, "google:sheets:punchlist");

				return { success: true, message: "Pushed to Punchlist successfully" };
			} catch (error) {
				ctx.logger.error(error, "Failed to push to Punchlist");
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to push to Punchlist: ${error instanceof Error ? error.message : "Unknown error"}`,
				});
			}
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

			const userToNotify = await ctx.db.query.users.findFirst({
				where: eq(users.id, input.userId),
				columns: {
					email: true,
					claimedReportFolder: true,
				},
			});

			await ctx.db
				.update(users)
				.set({ claimedReportFolder: null })
				.where(eq(users.id, input.userId));

			if (userToNotify?.claimedReportFolder) {
				const cookieHeader = ctx.headers.get("cookie") ?? "";

				// Fetch current queue count
				let queueCount = 0;
				try {
					const foldersResponse = await fetch(
						`${env.PY_API}/folders/1fGZavJU8bAqROKd8iTgoEtRT8orp4a4s`,
						{
							headers: { Cookie: cookieHeader },
						},
					);
					if (foldersResponse.ok) {
						const data = (await foldersResponse.json()) as {
							folders: unknown[];
						};
						queueCount = data.folders.length;
					}
				} catch (error) {
					ctx.logger.error(
						error,
						"Failed to fetch queue count for notification",
					);
				}

				try {
					await fetch(`${env.PY_API}/notifications/report-approved`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Cookie: cookieHeader,
						},
						body: JSON.stringify({
							user_email: userToNotify.email,
							report_name: userToNotify.claimedReportFolder.name,
							queue_count: queueCount,
						}),
					});
				} catch (error) {
					ctx.logger.error(
						{ error, userId: input.userId },
						"Failed to send approval notification via Python API",
					);
				}
			}

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
