import { TRPCError } from "@trpc/server";
import { eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import { formatClientAge } from "~/lib/utils";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { clients, clientsEvaluators, evaluators } from "~/server/db/schema";
import { sortClients } from "~/server/lib/utils";

export const clientRouter = createTRPCRouter({
	getAll: protectedProcedure.query(async ({ ctx }) => {
		const clients = await ctx.db.query.clients.findMany({});

		return clients ?? null;
	}),

	getSorted: protectedProcedure.query(async ({ ctx }) => {
		const allClients = await ctx.db.query.clients.findMany({});

		return sortClients(allClients) ?? null;
	}),

	getByNpi: protectedProcedure
		.input(z.number())
		.query(async ({ ctx, input }) => {
			const clientsByNpi = await ctx.db
				.select({ client: clients })
				.from(clients)
				.innerJoin(
					clientsEvaluators,
					eq(clients.id, clientsEvaluators.clientId),
				)
				.where(eq(clientsEvaluators.evaluatorNpi, input));

			const correctedClientsByNpi = clientsByNpi.map(({ client }) => client);

			return sortClients(correctedClientsByNpi) ?? null;
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

	getAsanaErrors: protectedProcedure.query(async ({ ctx }) => {
		const clientsWithoutAsanaId = await ctx.db
			.select({ client: clients })
			.from(clients)
			.where(isNull(clients.asanaId));

		return clientsWithoutAsanaId.map(({ client }) => client);
	}),

	getArchivedAsanaErrors: protectedProcedure.query(async ({ ctx }) => {
		const clientsArchivedInAsana = await ctx.db
			.select({ client: clients })
			.from(clients)
			.where(eq(clients.archivedInAsana, true));

		return clientsArchivedInAsana.map(({ client }) => client);
	}),

	getDistrictErrors: protectedProcedure.query(async ({ ctx }) => {
		const clientsWithoutDistrict = await ctx.db
			.select({ client: clients })
			.from(clients)
			.where(eq(clients.schoolDistrict, "Unknown"));

		return clientsWithoutDistrict.map(({ client }) => client);
	}),

	getBabyNetErrors: protectedProcedure.query(async ({ ctx }) => {
		const clientsTooOldForBabyNet = await ctx.db
			.select({ client: clients })
			.from(clients)
			.where(
				or(
					eq(clients.primaryInsurance, "BabyNet"),
					eq(clients.secondaryInsurance, "BabyNet"),
				),
			);

		let correctedClientsTooOldForBabyNet = clientsTooOldForBabyNet.map(
			({ client }) => client,
		);

		correctedClientsTooOldForBabyNet = correctedClientsTooOldForBabyNet.filter(
			(client) => {
				const age = formatClientAge(client.dob, "years");
				return Number(age) >= 3;
			},
		);

		return correctedClientsTooOldForBabyNet;
	}),

	addAsanaId: protectedProcedure
		.input(
			z.object({
				hash: z.string(),
				asanaId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await ctx.db
				.update(clients)
				.set({ asanaId: input.asanaId })
				.where(eq(clients.hash, input.hash));
		}),

	updateClient: protectedProcedure
		.input(
			z.object({
				hash: z.string(),
				firstName: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [client] = await ctx.db
				.select({ client: clients })
				.from(clients)
				.where(eq(clients.hash, input.hash))
				.limit(1);

			if (!client) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Client with hash ${input.hash} not found`,
				});
			}

			const fullName = `${input.firstName}${client.client.preferredName ? `(${client.client.preferredName})` : " "}${client.client.lastName}`;

			await ctx.db
				.update(clients)
				.set({ firstName: input.firstName, fullName })
				.where(eq(clients.hash, input.hash));

			const [updatedClient] = await ctx.db
				.select({ client: clients })
				.from(clients)
				.where(eq(clients.hash, input.hash))
				.limit(1);

			if (!updatedClient) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Client with hash ${input.hash} not found`,
				});
			}

			console.log(updatedClient);
			return updatedClient;
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
		.input(z.number())
		.query(async ({ ctx, input }) => {
			const evaluatorsByClient = await ctx.db
				.select({ evaluator: evaluators })
				.from(evaluators)
				.innerJoin(
					clientsEvaluators,
					eq(evaluators.npi, clientsEvaluators.evaluatorNpi),
				)
				.where(eq(clientsEvaluators.clientId, input));

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
