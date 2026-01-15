import { createHash } from "node:crypto";
import type { JSONContent } from "@tiptap/core";
import { TRPCError } from "@trpc/server";
import { subMonths, subYears } from "date-fns";
import {
	and,
	desc,
	eq,
	getTableColumns,
	gt,
	inArray,
	isNull,
	like,
	lt,
	not,
	or,
	sql,
} from "drizzle-orm";
import { z } from "zod";
import { CLIENT_COLOR_KEYS } from "~/lib/colors";
import { syncPunchData } from "~/lib/google";
import { logger } from "~/lib/logger";
import type { ClientWithIssueInfo } from "~/lib/types";
import { hasPermission } from "~/lib/utils";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
	clients,
	clientsEvaluators,
	failures,
	notes,
	questionnaires,
	schoolDistricts,
} from "~/server/db/schema";

const log = logger.child({ module: "ClientApi" });

export const getPriorityInfo = () => {
	const now = new Date();
	const BNAgeOutDate = subYears(now, 3);
	const highPriorityBNAge = subMonths(now, 30); // 2 years and 6 months

	const isHighPriorityClient = eq(clients.highPriority, true);

	const isHighPriorityBN = and(
		or(
			like(clients.primaryInsurance, "%BabyNet%"),
			like(clients.secondaryInsurance, "%BabyNet%"),
			eq(clients.babyNet, true),
		),
		lt(clients.dob, highPriorityBNAge),
		gt(clients.dob, BNAgeOutDate),
	);

	const sortReasonSQL = sql<string>`CASE
      WHEN ${isHighPriorityBN} AND ${isHighPriorityClient} THEN 'BabyNet and High Priority'
      WHEN ${isHighPriorityBN} THEN 'BabyNet above 2:6'
      WHEN ${isHighPriorityClient} THEN 'High Priority'
      WHEN CHAR_LENGTH(${clients.id}) = 5 THEN 'Note only'
      ELSE 'Added date'
    END`.as("sortReason");

	const orderBySQL = [
		// Primary sorting: 0 for BabyNet, 1 for top priority, 2 for everyone else
		sql`CASE
			WHEN ${isHighPriorityBN} AND ${isHighPriorityClient} THEN 0
      WHEN ${isHighPriorityBN} THEN 1
      WHEN ${isHighPriorityClient} THEN 2
      ELSE 3
    END`,
		// Secondary sorting: BabyNet group is sorted by DOB, all others by added date
		sql`CASE
      WHEN ${isHighPriorityBN} THEN ${clients.dob}
      ELSE ${clients.addedDate}
    END`,
	];

	// A combined flag for any type of priority status
	const isPriority = or(isHighPriorityClient, isHighPriorityBN);

	return { isPriority, sortReasonSQL, orderBySQL };
};

export const clientRouter = createTRPCRouter({
	getAll: protectedProcedure.query(async ({ ctx }) => {
		const clients = await ctx.db.query.clients.findMany({});

		return clients;
	}),

	getOne: protectedProcedure
		.input(
			z.object({
				column: z.enum(["id", "hash"]),
				value: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			log.info(
				{
					user: ctx.session.user.email,
					column: input.column,
					value: input.value,
				},
				"Getting client",
			);

			const foundClient = await ctx.db.query.clients.findFirst({
				where: eq(clients[input.column], input.value),
			});

			if (!foundClient) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Client with ${input.column} ${input.value} not found`,
				});
			}

			if (ctx.session.user.accessToken && ctx.session.user.refreshToken) {
				await syncPunchData(ctx.session, [foundClient.id], ctx.redis);
			}

			const syncedClient = await ctx.db.query.clients.findFirst({
				where: eq(clients.id, foundClient.id),
			});

			if (!syncedClient) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to retrieve synced client data",
				});
			}

			const district = await ctx.db.query.schoolDistricts.findFirst({
				where: eq(schoolDistricts.fullName, syncedClient.schoolDistrict ?? ""),
			});

			type ClosestOffice = {
				key: string;
				prettyName: string;
				latitude: string;
				longitude: string;
				distanceMiles: number;
			};

			let closestOffices: ClosestOffice[] = [];
			if (syncedClient.latitude && syncedClient.longitude) {
				const [rows] = await ctx.db.execute<ClosestOffice>(sql`
        SELECT
          o.key,
          o.prettyName,
          o.latitude,
          o.longitude,
          (3959 * acos(
            cos(radians(${syncedClient.latitude})) *
            cos(radians(o.latitude)) *
            cos(radians(o.longitude) - radians(${syncedClient.longitude})) +
            sin(radians(${syncedClient.latitude})) *
            sin(radians(o.latitude))
          )) as distanceMiles
        FROM emr_office o
        ORDER BY distanceMiles
        LIMIT 3
      `);

				closestOffices = rows as unknown as ClosestOffice[];
			}

			return {
				...syncedClient,
				closestOffices,
				schoolDistrictDetails: district,
			};
		}),

	getFailures: protectedProcedure
		.input(z.number().optional())
		.query(async ({ ctx, input }) => {
			if (!input) {
				return [];
			}

			const clientFailures = await ctx.db.query.failures.findMany({
				where: and(eq(failures.clientId, input), lt(failures.reminded, 100)),
			});

			return clientFailures;
		}),

	getSorted: protectedProcedure.query(async ({ ctx }) => {
		const { sortReasonSQL, orderBySQL } = getPriorityInfo();

		const allSortedClients = await ctx.db.query.clients.findMany({
			extras: { sortReason: sortReasonSQL },
			orderBy: orderBySQL,
		});

		return allSortedClients;
	}),

	getByNpi: protectedProcedure
		.input(z.number())
		.query(async ({ ctx, input }) => {
			const { sortReasonSQL, orderBySQL } = getPriorityInfo();

			const clientsWithReason = await ctx.db
				.select({
					client: clients,
					sortReason: sortReasonSQL,
				})
				.from(clients)
				.innerJoin(
					clientsEvaluators,
					eq(clients.id, clientsEvaluators.clientId),
				)
				.where(eq(clientsEvaluators.evaluatorNpi, input))
				.orderBy(...orderBySQL);

			if (!clientsWithReason || clientsWithReason.length === 0) {
				return null;
			}

			const results = clientsWithReason.map((row) => ({
				...row.client,
				sortReason: row.sortReason,
			}));

			return results;
		}),

	getDistrictErrors: protectedProcedure.query(async ({ ctx }) => {
		const clientsWithoutDistrict = await ctx.db.query.clients.findMany({
			where: and(
				or(
					eq(clients.schoolDistrict, "Unknown"),
					isNull(clients.schoolDistrict),
				),
				gt(clients.dob, subYears(new Date(), 21)),
				not(eq(sql`LENGTH(${clients.id})`, 5)),
			),
		});

		const clientsWithDistrictFromShapefile =
			await ctx.db.query.clients.findMany({
				where: and(
					eq(clients.flag, "district_from_shapefile"),
					gt(clients.dob, subYears(new Date(), 21)),
					not(eq(sql`LENGTH(${clients.id})`, 5)),
				),
			});

		return {
			clientsWithoutDistrict,
			clientsWithDistrictFromShapefile,
		};
	}),

	getBabyNetErrors: protectedProcedure.query(async ({ ctx }) => {
		const ageOutDate = new Date();
		ageOutDate.setFullYear(ageOutDate.getFullYear() - 3); // 3 years old

		const clientsTooOldForBabyNet = await ctx.db.query.clients.findMany({
			where: and(
				or(
					like(clients.primaryInsurance, "%BabyNet%"),
					like(clients.secondaryInsurance, "%BabyNet%"),
				),
				lt(clients.dob, ageOutDate),
				eq(clients.status, true),
			),
			orderBy: clients.addedDate,
		});

		// Discussed in meeting on 9/11/25: Automatically disable BabyNet bool for clients that age out
		const clientsTooOldForBabyNetBool = await ctx.db.query.clients.findMany({
			where: and(
				eq(clients.babyNet, true),
				lt(clients.dob, ageOutDate),
				eq(clients.status, true),
			),
		});

		for (const client of clientsTooOldForBabyNetBool) {
			await ctx.db
				.update(clients)
				.set({ babyNet: false })
				.where(eq(clients.id, client.id));
		}

		return clientsTooOldForBabyNet;
	}),

	getNotInTAErrors: protectedProcedure.query(async ({ ctx }) => {
		const clientsNotInTA = await ctx.db.query.clients.findMany({
			where: isNull(clients.addedDate),
			orderBy: clients.addedDate,
		});

		return clientsNotInTA;
	}),

	getDropList: protectedProcedure.query(async ({ ctx }) => {
		const uniqueClientsMap = new Map<number, ClientWithIssueInfo>();

		const overRemindedQs = await ctx.db.query.clients.findMany({
			where: eq(clients.status, true),
			with: {
				questionnaires: {
					where: and(
						or(
							eq(questionnaires.status, "PENDING"),
							eq(questionnaires.status, "SPANISH"),
						),
						gt(questionnaires.reminded, 3),
					),
				},
			},
		});

		for (const client of overRemindedQs) {
			if (client.questionnaires.length > 0) {
				const reason = "Qs Pending (3 reminders)";

				// Create a clean client object without the joined data
				const { questionnaires: qList, ...clientData } = client;

				let oldestDate: Date | undefined;
				for (const q of qList) {
					if (q.sent) {
						const d = new Date(q.sent);
						if (!oldestDate || d < oldestDate) {
							oldestDate = d;
						}
					}
				}

				uniqueClientsMap.set(clientData.id, {
					...(clientData as typeof clients.$inferSelect),
					additionalInfo: reason,
					initialFailureDate: oldestDate,
				});
			}
		}

		const clientsWithFailures = await ctx.db.query.clients.findMany({
			where: eq(clients.status, true),
			with: {
				failures: {
					where: and(gt(failures.reminded, 3), lt(failures.reminded, 100)),
				},
			},
		});

		for (const client of clientsWithFailures) {
			if (client.failures.length > 0) {
				let maxReminded = 0;
				let failureReasonText = "";
				let oldestFailureDate: Date | undefined;

				for (const f of client.failures) {
					if (f.reminded && f.reminded > maxReminded) {
						maxReminded = f.reminded;
						failureReasonText = f.reason;
					}
					const d = new Date(f.failedDate);
					if (!oldestFailureDate || d < oldestFailureDate) {
						oldestFailureDate = d;
					}
				}

				const newReason = `${failureReasonText} (3 reminders)`;

				// Create a clean client object without the joined data
				const { failures: _, ...clientData } = client;

				if (uniqueClientsMap.has(clientData.id)) {
					// Client already found (e.g., in the questionnaire query), so append the reason
					const existingClient = uniqueClientsMap.get(clientData.id);
					if (existingClient) {
						existingClient.additionalInfo += ` / ${newReason}`;
						if (
							oldestFailureDate &&
							(!existingClient.initialFailureDate ||
								oldestFailureDate < existingClient.initialFailureDate)
						) {
							existingClient.initialFailureDate = oldestFailureDate;
						}
					}
				} else {
					// New client, add with the failure reason
					uniqueClientsMap.set(clientData.id, {
						...(clientData as typeof clients.$inferSelect),
						additionalInfo: newReason,
						initialFailureDate: oldestFailureDate,
					});
				}
			}
		}

		return Array.from(uniqueClientsMap.values()).sort((a, b) => {
			if (!a.initialFailureDate && !b.initialFailureDate) return 0;
			if (!a.initialFailureDate) return 1;
			if (!b.initialFailureDate) return -1;
			return a.initialFailureDate.getTime() - b.initialFailureDate.getTime();
		});
	}),

	getNoteOnlyClients: protectedProcedure.query(async ({ ctx }) => {
		const noteOnlyClients = await ctx.db.query.clients.findMany({
			where: and(eq(sql`LENGTH(${clients.id})`, 5), eq(clients.status, true)),
			orderBy: desc(clients.addedDate),
		});

		return noteOnlyClients;
	}),

	getNoDriveIdErrors: protectedProcedure.query(async ({ ctx }) => {
		const noDriveId = await ctx.db.query.clients.findMany({
			where: isNull(clients.driveId),
			orderBy: clients.addedDate,
		});

		return noDriveId;
	}),

	getDD4: protectedProcedure.query(async ({ ctx }) => {
		const dd4 = await ctx.db.query.clients.findMany({
			where: and(
				eq(clients.schoolDistrict, "Dorchester School District 4"),
				eq(clients.status, true),
			),
			orderBy: clients.addedDate,
		});
		return dd4;
	}),

	getPossiblePrivatePay: protectedProcedure.query(async ({ ctx }) => {
		const noPaymentMethodOrNoEligibleEvaluators = await ctx.db
			.select(getTableColumns(clients))
			.from(clients)
			.leftJoin(clientsEvaluators, eq(clients.id, clientsEvaluators.clientId))
			.where(
				and(
					or(
						and(
							isNull(clients.primaryInsurance),
							isNull(clients.secondaryInsurance),
							eq(clients.privatePay, false),
							not(eq(clients.schoolDistrict, "Dorchester School District 4")), // We can't work with anyone in DD4
						),
						isNull(clientsEvaluators.clientId),
					),
					eq(clients.status, true),
					not(eq(sql`LENGTH(${clients.id})`, 5)),
				),
			)
			.orderBy(clients.addedDate);

		return noPaymentMethodOrNoEligibleEvaluators;
	}),

	getAutismStops: protectedProcedure.query(async ({ ctx }) => {
		const autismStops = await ctx.db.query.clients.findMany({
			where: and(eq(clients.autismStop, true), eq(clients.status, true)),
			orderBy: clients.addedDate,
		});

		return autismStops;
	}),

	createShell: protectedProcedure
		.input(z.object({ firstName: z.string(), lastName: z.string() }))
		.mutation(async ({ ctx, input }) => {
			if (!hasPermission(ctx.session.user.permissions, "clients:shell")) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You do not have permission to create a shell client.",
				});
			}

			log.info({ user: ctx.session.user.id }, "Creating shell client");

			const id = Math.floor(10000 + Math.random() * 90000); // Random 5 digit number
			await ctx.db.insert(clients).values({
				id: id,
				hash: createHash("md5").update(String(id)).digest("hex"),
				dob: new Date(0),
				firstName: input.firstName,
				lastName: input.lastName,
				fullName: `${input.firstName} ${input.lastName}`,
				addedDate: new Date(),
			});

			const newClient = await ctx.db.query.clients.findFirst({
				where: eq(clients.id, id),
			});

			if (!newClient) {
				throw new Error(
					"Failed to create client: could not retrieve new client.",
				);
			}

			return newClient.hash;
		}),

	autismStop: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
				autismStop: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (
				!hasPermission(
					ctx.session.user.permissions,
					"clients:autismstop:disable",
				) &&
				input.autismStop === false
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
				});
			}

			log.info(
				{
					user: ctx.session.user.id,
					autismStop: input.autismStop,
					id: input.clientId,
				},
				"Updating autism stop for client",
			);

			await ctx.db
				.update(clients)
				.set({
					autismStop: input.autismStop,
				})
				.where(eq(clients.id, input.clientId));

			const updatedClient = await ctx.db.query.clients.findFirst({
				where: eq(clients.id, input.clientId),
			});

			if (!updatedClient) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Client with ID ${input.clientId} not found`,
				});
			}

			return updatedClient;
		}),

	update: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
				color: z.enum(CLIENT_COLOR_KEYS).optional(),
				schoolDistrict: z.string().optional(),
				highPriority: z.boolean().optional(),
				babyNet: z.boolean().optional(),
				eiAttends: z.boolean().optional(),
				driveId: z.string().optional(),
				status: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (
				input.status !== undefined &&
				input.clientId.toString().length !== 5
			) {
				throw new TRPCError({
					code: "NOT_IMPLEMENTED",
					message:
						"Imported client's status can only be edited at source data.",
				});
			}

			const unauthorizedPermissions = [
				...(input.color !== undefined &&
				!hasPermission(ctx.session.user.permissions, "clients:color")
					? ["clients:color"]
					: []),
				...(input.schoolDistrict !== undefined &&
				!hasPermission(ctx.session.user.permissions, "clients:schooldistrict")
					? ["clients:schooldistrict"]
					: []),
				...(input.highPriority !== undefined &&
				!hasPermission(ctx.session.user.permissions, "clients:priority")
					? ["clients:priority"]
					: []),
				...(input.babyNet !== undefined &&
				!hasPermission(ctx.session.user.permissions, "clients:babynet")
					? ["clients:babynet"]
					: []),
				...(input.eiAttends !== undefined &&
				!hasPermission(ctx.session.user.permissions, "clients:ei")
					? ["clients:ei"]
					: []),
				...(input.driveId !== undefined &&
				!hasPermission(ctx.session.user.permissions, "clients:drive")
					? ["clients:drive"]
					: []),
				...(input.status !== undefined &&
				!hasPermission(ctx.session.user.permissions, "clients:shell")
					? ["clients:shell"]
					: []),
			];
			if (unauthorizedPermissions.length > 0) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: `You do not have permission to set ${unauthorizedPermissions.join(
						", ",
					)}.`,
				});
			}

			log.info({ user: ctx.session.user.id, ...input }, "Updating client");

			const currentClient = await ctx.db.query.clients.findFirst({
				where: eq(clients.id, input.clientId),
			});

			const updateData: {
				color?: (typeof CLIENT_COLOR_KEYS)[number];
				schoolDistrict?: string;
				highPriority?: boolean;
				babyNet?: boolean;
				eiAttends?: boolean;
				flag?: string | null;
				driveId?: string | null;
				status?: boolean;
			} = {};

			if (input.color !== undefined) {
				updateData.color = input.color;
			}
			if (input.schoolDistrict !== undefined) {
				updateData.schoolDistrict = input.schoolDistrict;
				if (currentClient?.flag === "district_from_shapefile") {
					updateData.flag = null;
				}
			}
			if (input.highPriority !== undefined) {
				updateData.highPriority = input.highPriority;
			}
			if (input.babyNet !== undefined) {
				updateData.babyNet = input.babyNet;
			}
			if (input.eiAttends !== undefined) {
				updateData.eiAttends = input.eiAttends;
			}
			if (input.driveId !== undefined) {
				const existingClient = await ctx.db.query.clients.findFirst({
					where: and(
						eq(clients.driveId, input.driveId),
						not(eq(clients.driveId, "N/A")),
					),
				});

				if (existingClient) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `A client already has this folder linked: ${existingClient.fullName} (ID: ${existingClient.id})`,
					});
				} else {
					updateData.driveId = input.driveId;
				}
			}
			if (input.status !== undefined) {
				updateData.status = input.status;
			}

			await ctx.db
				.update(clients)
				.set(updateData)
				.where(eq(clients.id, input.clientId));

			const updatedClient = await ctx.db.query.clients.findFirst({
				where: eq(clients.id, input.clientId),
			});

			if (!updatedClient) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Client with ID ${input.clientId} not found`,
				});
			}

			return updatedClient;
		}),

	search: protectedProcedure
		.input(
			z.object({
				evaluatorNpi: z.number().optional(),
				office: z.string().optional(),
				appointmentType: z.enum(["EVAL", "DA", "DAEVAL"]).optional(),
				appointmentDate: z.date().optional(),
				nameSearch: z.string().optional(),
				hideBabyNet: z.boolean().optional(),
				status: z.enum(["active", "inactive", "all"]).optional(),
				type: z.enum(["both", "real", "note"]).optional(),
				color: z.enum(CLIENT_COLOR_KEYS).optional(),
				privatePay: z.boolean().optional(),
				autismStop: z.boolean().optional(),
				sort: z
					.enum(["priority", "firstName", "lastName", "paExpiration"])
					.optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const {
				evaluatorNpi,
				office,
				// Future implementation
				// appointmentType,
				// appointmentDate,
				nameSearch,
				hideBabyNet,
				status,
				type,
				color,
				privatePay,
				autismStop,
				sort,
			} = input;

			const effectiveStatus = status ?? "active";
			const effectiveType = type ?? "both";

			const effectiveSort = sort ?? "priority";

			const conditions = [];

			if (nameSearch) {
				const numericId = parseInt(nameSearch.trim(), 10);
				if (!Number.isNaN(numericId)) {
					conditions.push(like(clients.id, `${numericId}%`));
				} else if (nameSearch.length >= 3) {
					// Clean the user's input string by replacing non-alphanumeric characters with spaces
					const cleanedSearchString = nameSearch.replace(/[^\w ]/g, " ");
					3424620;

					// Split the cleaned string by spaces and filter out any empty strings
					const searchWords = cleanedSearchString.split(" ").filter(Boolean);

					if (searchWords.length > 0) {
						const nameConditions = searchWords.map(
							(word) =>
								sql`REGEXP_REPLACE(${
									clients.fullName
									// As bizarre as this looks, we have to escape the slash for both JS and SQL
								}, '[^\\\\w ]', '') like ${`%${word}%`}`,
						);

						conditions.push(and(...nameConditions));
					}
				}
			}

			if (office) {
				conditions.push(eq(clients.closestOffice, office));
			}

			if (effectiveStatus === "active") {
				conditions.push(eq(clients.status, true));
			} else if (effectiveStatus === "inactive") {
				conditions.push(eq(clients.status, false));
			}

			if (effectiveType === "real") {
				conditions.push(not(eq(sql`LENGTH(${clients.id})`, 5)));
			} else if (effectiveType === "note") {
				conditions.push(eq(sql`LENGTH(${clients.id})`, 5));
			}

			if (hideBabyNet) {
				conditions.push(
					and(
						not(like(clients.primaryInsurance, "%BabyNet%")),
						or(
							not(like(clients.secondaryInsurance, "%BabyNet%")),
							isNull(clients.secondaryInsurance),
						),
						not(eq(clients.babyNet, true)),
					),
				);
			}

			if (evaluatorNpi) {
				const clientIdsQuery = ctx.db
					.select({ id: clientsEvaluators.clientId })
					.from(clientsEvaluators)
					.where(eq(clientsEvaluators.evaluatorNpi, evaluatorNpi));

				conditions.push(inArray(clients.id, clientIdsQuery));
			}

			if (privatePay) {
				conditions.push(eq(clients.privatePay, true));
			}

			if (autismStop) {
				conditions.push(eq(clients.autismStop, true));
			}

			const countByColor = await ctx.db
				.select({
					color: clients.color,
					count: sql<number>`COUNT(*)`.as("count"),
				})
				.from(clients)
				.where(conditions.length > 0 ? and(...conditions) : undefined)
				.groupBy(clients.color);

			if (color) {
				conditions.push(eq(clients.color, color));
			}

			let { sortReasonSQL, orderBySQL } = getPriorityInfo();

			if (effectiveSort === "priority") {
			} else if (effectiveSort === "firstName") {
				orderBySQL = [sql`${clients.firstName}`];
			} else if (effectiveSort === "lastName") {
				orderBySQL = [sql`${clients.lastName}`];
			} else if (effectiveSort === "paExpiration") {
				orderBySQL = [
					sql`CASE
            WHEN ${clients.precertExpires} IS NULL THEN 3
            WHEN ${clients.precertExpires} < NOW() THEN 2
            ELSE 1
        END`,
					sql`${clients.precertExpires}`,
				];
				sortReasonSQL = sql<string>`CASE
          WHEN ${clients.precertExpires} IS NULL THEN 'No PA'
          WHEN ${clients.precertExpires} < NOW() THEN 'Expired PA'
          ELSE 'Expiration date'
        END`.as("sortReason");
			}

			const filteredAndSortedClients = await ctx.db
				.select({ ...getTableColumns(clients), sortReason: sortReasonSQL })
				.from(clients)
				.where(and(conditions.length > 0 ? and(...conditions) : undefined))
				.orderBy(...orderBySQL);

			return {
				clients: filteredAndSortedClients,
				colorCounts: countByColor,
			};
		}),

	replaceNotes: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
				fakeClientId: z.number(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			log.info({ user: ctx.session.user, ...input }, "Merging shell client");

			const { clientId, fakeClientId } = input;

			const [realClientNote] = await ctx.db
				.select()
				.from(notes)
				.where(eq(notes.clientId, clientId))
				.limit(1);

			const [fakeClientNote] = await ctx.db
				.select()
				.from(notes)
				.where(eq(notes.clientId, fakeClientId))
				.limit(1);

			const [realClient] = await ctx.db
				.select()
				.from(clients)
				.where(eq(clients.id, clientId))
				.limit(1);

			const [fakeClient] = await ctx.db
				.select()
				.from(clients)
				.where(eq(clients.id, fakeClientId))
				.limit(1);

			if (!fakeClientNote || !realClient || !fakeClient) {
				throw new Error("Client data does not exist for merge operation.");
			}

			const fakeContent = fakeClientNote.content as JSONContent;
			const fakeTitle = fakeClientNote.title;

			const fakeHasContent =
				fakeContent?.content &&
				Array.isArray(fakeContent.content) &&
				fakeContent.content.length > 0;

			if (!fakeHasContent && !fakeTitle) {
				throw new Error(
					'"Notes Only" client is empty. It must have content or a title to merge.',
				);
			}

			let mergedTitle: string | null;

			if (realClientNote?.title && fakeTitle) {
				mergedTitle = `${realClientNote.title} | ${fakeTitle}`;
			} else if (realClientNote?.title) {
				mergedTitle = realClientNote.title;
			} else if (fakeTitle) {
				mergedTitle = fakeTitle;
			} else {
				mergedTitle = null;
			}

			let mergedContent: JSONContent;

			if (realClientNote) {
				// Real note exists. Check if we need to merge content.
				const realContent = realClientNote.content as JSONContent;

				if (!realContent?.content || !Array.isArray(realContent.content)) {
					throw new Error(
						"Imported client note content is not in the expected Tiptap format.",
					);
				}

				const realHasContent = realContent.content.length > 0;

				if (realHasContent && fakeHasContent) {
					// Both have content. Merge content with a separator.
					const separator = { type: "paragraph" }; // Using an empty paragraph as separator

					mergedContent = {
						type: "doc",
						content: [
							...(realContent.content || []),
							separator,
							...(fakeContent.content || []),
						],
					};
				} else if (realHasContent) {
					// Only real note has content (fake note has only title, or is empty content). Keep real content.
					mergedContent = realContent;
				} else if (fakeHasContent) {
					// SOnly fake note has content (real note has only title, or is empty content). Use fake content.
					mergedContent = fakeContent;
				} else {
					// Neither has content (e.g., both have only titles). Keep real content structure, even though empty.
					mergedContent = realContent;
				}

				// Update the existing note.
				await ctx.db
					.update(notes)
					.set({
						content: mergedContent,
						updatedAt: new Date(),
						title: mergedTitle,
					})
					.where(eq(notes.clientId, clientId));
			} else {
				// Real note does not exist. Create a new one.
				mergedContent = fakeHasContent
					? fakeContent
					: { type: "doc", content: [] };

				// Insert a new note entry for the real client.
				await ctx.db.insert(notes).values({
					clientId: clientId,
					content: mergedContent,
					title: mergedTitle,
				});
			}

			await ctx.db
				.update(clients)
				.set({ status: false })
				.where(eq(clients.id, fakeClientId));

			return {
				success: true,
				message: `Merged ${fakeClient.fullName}'s notes/title into ${realClient.fullName}.`,
			};
		}),
});
