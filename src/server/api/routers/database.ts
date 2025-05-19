import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { clients, clientsEvaluators } from "~/server/db/schema";

export const clientRouter = createTRPCRouter({
	getAll: protectedProcedure.query(async ({ ctx }) => {
		const clients = await ctx.db.query.clients.findMany({});

		return clients ?? null;
	}),

	getByNpi: protectedProcedure
		.input(z.string())
		.query(async ({ ctx, input }) => {
			const clientsByNpi = await ctx.db
				.select({ client: clients })
				.from(clients)
				.innerJoin(clientsEvaluators, eq(clients.id, clientsEvaluators.id))
				.where(eq(clientsEvaluators.npi, input));

			return clientsByNpi ?? null;
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
		console.log(offices);
		return offices ?? null;
	}),
});
