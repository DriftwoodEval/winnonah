import { TRPCError } from "@trpc/server";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { clients, clientsEvaluators, evaluators } from "~/server/db/schema";

export const clientRouter = createTRPCRouter({
	getAll: protectedProcedure.query(async ({ ctx }) => {
		const clients = await ctx.db.query.clients.findMany({});

		return clients ?? null;
	}),

	getSorted: protectedProcedure.query(async ({ ctx }) => {
		const babynetClients = await ctx.db
			.select({ client: clients })
			.from(clients)
			.where(
				or(
					eq(clients.primaryInsurance, "BABYNET"),
					eq(clients.secondaryInsurance, "BABYNET"),
				),
			);

		const correctedBabynetClients = babynetClients.map(({ client }) => client);

		// Get clients that are older than 2 years:6 months
		const minAge = new Date();
		minAge.setFullYear(minAge.getFullYear() - 2);
		minAge.setMonth(minAge.getMonth() - 6);

		const clientsBabynetAboveAge = correctedBabynetClients.filter(
			(client) => client.dob && new Date(client.dob) < minAge,
		);

		clientsBabynetAboveAge.sort(
			(a, b) => new Date(a.dob).getTime() - new Date(b.dob).getTime(),
		);

		const restOfClients = await ctx.db
			.select({ client: clients })
			.from(clients);

		let correctedRestOfClients = restOfClients.map(({ client }) => client);

		correctedRestOfClients.sort(
			(a, b) =>
				new Date(a.addedDate).getTime() - new Date(b.addedDate).getTime(),
		);

		correctedRestOfClients = correctedRestOfClients.filter(
			(client) =>
				!clientsBabynetAboveAge.some(
					(babynetClient) => babynetClient.id === client.id,
				),
		);

		const sortedClients = [
			...clientsBabynetAboveAge,
			...correctedRestOfClients,
		];

		return sortedClients ?? null;
	}),

	getByNpi: protectedProcedure
		.input(z.string())
		.query(async ({ ctx, input }) => {
			const clientsByNpi = await ctx.db
				.select({ client: clients })
				.from(clients)
				.innerJoin(
					clientsEvaluators,
					eq(clients.id, clientsEvaluators.client_id),
				)
				.where(eq(clientsEvaluators.evaluator_npi, input));

			const correctedClientsByNpi = clientsByNpi.map(({ client }) => client);

			return correctedClientsByNpi ?? null;
		}),

	getOne: protectedProcedure
		.input(
			z.object({
				column: z.enum(["id", "hash"]),
				value: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const [foundClient] = await ctx.db
				.select({ client: clients })
				.from(clients)
				.where(eq(clients[input.column], input.value))
				.limit(1);

			if (!foundClient) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Client with ${input.column} ${input.value} not found`,
				});
			}

			return foundClient.client;
		}),
});

export const evaluatorRouter = createTRPCRouter({
	getAll: protectedProcedure.query(async ({ ctx }) => {
		const evaluators = await ctx.db.query.evaluators.findMany({});

		return (
			evaluators.sort((a, b) => a.providerName.localeCompare(b.providerName)) ??
			null
		);
	}),

	getEligibleForClient: protectedProcedure
		.input(z.string())
		.query(async ({ ctx, input }) => {
			const evaluatorsByClient = await ctx.db
				.select({ evaluator: evaluators })
				.from(evaluators)
				.innerJoin(
					clientsEvaluators,
					eq(evaluators.npi, clientsEvaluators.evaluator_npi),
				)
				.where(eq(clientsEvaluators.client_id, input));

			const correctedEvaluatorsByClient = evaluatorsByClient
				.map(({ evaluator }) => evaluator)
				.sort((a, b) => a.providerName.localeCompare(b.providerName));

			return correctedEvaluatorsByClient ?? null;
		}),
});

export type Offices = {
	[key: string]: {
		latitude: string;
		longitude: string;
		prettyName: string;
	};
};

export const officeRouter = createTRPCRouter({
	getAll: protectedProcedure.query(() => {
		const officeAddresses = env.OFFICE_ADDRESSES;
		const offices: Offices = officeAddresses
			.split(";")
			.reduce((acc: Offices, address) => {
				const [key, ...values] = address.split(":");
				const [latitude, longitude, prettyName] = (values[0] ?? "").split(",");
				if (
					key !== undefined &&
					latitude !== undefined &&
					longitude !== undefined &&
					prettyName !== undefined
				) {
					acc[key] = { latitude, longitude, prettyName };
				}
				return acc;
			}, {});
		return offices ?? null;
	}),
});
