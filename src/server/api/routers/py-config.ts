import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { pythonConfigSchema } from "~/lib/validations";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { pythonConfig } from "~/server/db/schema";

export const pyConfigRouter = createTRPCRouter({
	get: protectedProcedure.query(async ({ ctx }) => {
		const record = await ctx.db.query.pythonConfig.findFirst({
			where: eq(pythonConfig.id, 1),
		});

		return record?.data ?? null;
	}),

	update: protectedProcedure
		.input(pythonConfigSchema)
		.mutation(async ({ ctx, input }) => {
			await ctx.db
				.insert(pythonConfig)
				.values({ id: 1, data: input })
				.onDuplicateKeyUpdate({ set: { data: input } });

			return { success: true };
		}),

	getOpenPhoneUsers: protectedProcedure
		.input(z.object({ apiKey: z.string().optional() }))
		.query(async ({ ctx, input }) => {
			let apiKey = input.apiKey;

			if (!apiKey) {
				const record = await ctx.db.query.pythonConfig.findFirst({
					where: eq(pythonConfig.id, 1),
				});
				apiKey = record?.data.services.openphone.key;
			}

			if (!apiKey) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "OpenPhone API key is required",
				});
			}

			try {
				const response = await fetch("https://api.openphone.com/v1/users", {
					headers: {
						Authorization: apiKey,
					},
				});

				if (!response.ok) {
					const errorData = await response.json();
					throw new Error(errorData.message || "Failed to fetch users");
				}

				const data = (await response.json()) as {
					data: {
						id: string;
						firstName?: string;
						lastName?: string;
						email?: string;
					}[];
				};

				// We also need their phone numbers, which are in /phone-numbers
				const numbersResponse = await fetch(
					"https://api.openphone.com/v1/phone-numbers",
					{
						headers: {
							Authorization: apiKey,
						},
					},
				);

				if (!numbersResponse.ok) {
					throw new Error("Failed to fetch phone numbers");
				}

				const numbersData = (await numbersResponse.json()) as {
					data: {
						id: string;
						number: string;
						userId?: string;
						sharedWith?: { userId: string }[];
					}[];
				};

				return data.data.map((user) => {
					const userNumber = numbersData.data.find(
						(n) =>
							n.userId === user.id || n.sharedWith?.some((s) => s.userId === user.id),
					);
					return {
						id: user.id,
						name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || user.id,
						phone: userNumber?.number ?? "",
					};
				});
			} catch (e) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: e instanceof Error ? e.message : "Unknown error",
				});
			}
		}),
});
