import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { clients, clientsEvaluators } from "~/server/db/schema";

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

		const correctedRestOfClients = restOfClients.map(({ client }) => client);

		correctedRestOfClients.filter(
			(client) => !clientsBabynetAboveAge.includes(client),
		);

		correctedRestOfClients.sort(
			(a, b) =>
				new Date(a.addedDate).getTime() - new Date(b.addedDate).getTime(),
		);

		clientsBabynetAboveAge.push(...correctedRestOfClients);

		return clientsBabynetAboveAge ?? null;
	}),

	getByNpi: protectedProcedure
		.input(z.string())
		.query(async ({ ctx, input }) => {
			const clientsByNpi = await ctx.db
				.select({ client: clients })
				.from(clients)
				.innerJoin(clientsEvaluators, eq(clients.id, clientsEvaluators.id))
				.where(eq(clientsEvaluators.npi, input));

			const correctedClientsByNpi = clientsByNpi.map(({ client }) => client);

			return correctedClientsByNpi ?? null;
		}),
});

export const evaluatorRouter = createTRPCRouter({
	getAll: protectedProcedure.query(async ({ ctx }) => {
		const evaluators = await ctx.db.query.evaluators.findMany({});

		return evaluators ?? null;
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
		const offices: Offices = JSON.parse(env.OFFICE_ADDRESSES);
		return offices ?? null;
	}),
});
