import { eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { clients, schedulingClients } from "~/server/db/schema";

export const schedulingRouter = createTRPCRouter({
	get: protectedProcedure.query(async () => {
		const scheduledClients = await db.query.schedulingClients.findMany({
			where: eq(schedulingClients.archived, false),
			with: {
				client: true,
			},
		});

		const allEvaluators = await db.query.evaluators.findMany();
		const allOffices = await db.query.offices.findMany();

		return {
			clients: scheduledClients,
			evaluators: allEvaluators,
			offices: allOffices,
		};
	}),

	getArchived: protectedProcedure.query(async () => {
		const scheduledClients = await db.query.schedulingClients.findMany({
			where: eq(schedulingClients.archived, true),
			with: {
				client: true,
			},
		});

		const allEvaluators = await db.query.evaluators.findMany();
		const allOffices = await db.query.offices.findMany();

		return {
			clients: scheduledClients,
			evaluators: allEvaluators,
			offices: allOffices,
		};
	}),

	add: protectedProcedure
		.input(z.object({ clientId: z.number() }))
		.mutation(async ({ input }) => {
			const client = await db.query.clients.findFirst({
				where: eq(clients.id, input.clientId),
			});

			await db
				.insert(schedulingClients)
				.values({
					clientId: input.clientId,
					archived: false,
					office: client?.closestOffice,
				})
				.onDuplicateKeyUpdate({ set: { archived: false } });
		}),

	update: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
				evaluatorNpi: z.number().nullable().optional(),
				date: z.string().optional(),
				time: z.string().optional(),
				office: z.string().optional(),
				karenNotes: z.string().optional(),
				barbaraNotes: z.string().optional(),
				code: z.string().optional(),
				color: z.string().nullable().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const updateData: {
				evaluator?: number | null;
				date?: string;
				time?: string;
				office?: string;
				karenNotes?: string;
				barbaraNotes?: string;
				code?: string;
				color?: string | null;
			} = {};

			if (input.evaluatorNpi !== undefined) {
				updateData.evaluator = input.evaluatorNpi;
			}
			if (input.date !== undefined) {
				updateData.date = input.date;
			}
			if (input.time !== undefined) {
				updateData.time = input.time;
			}
			if (input.office !== undefined) {
				updateData.office = input.office;
			}
			if (input.karenNotes !== undefined) {
				updateData.karenNotes = input.karenNotes;
			}
			if (input.barbaraNotes !== undefined) {
				updateData.barbaraNotes = input.barbaraNotes;
			}
			if (input.code !== undefined) {
				updateData.code = input.code;
			}
			if (input.color !== undefined) {
				updateData.color = input.color;
			}
			await db
				.update(schedulingClients)
				.set(updateData)
				.where(eq(schedulingClients.clientId, input.clientId));
		}),

	archive: protectedProcedure
		.input(z.object({ clientId: z.number() }))
		.mutation(async ({ input }) => {
			await db
				.update(schedulingClients)
				.set({ archived: true })
				.where(eq(schedulingClients.clientId, input.clientId));
		}),

	unarchive: protectedProcedure
		.input(z.object({ clientId: z.number() }))
		.mutation(async ({ input }) => {
			await db
				.update(schedulingClients)
				.set({ archived: false })
				.where(eq(schedulingClients.clientId, input.clientId));
		}),
});
