import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const pythonRouter = createTRPCRouter({
	testEndpoint: protectedProcedure
		.input(
			z.object({
				age: z.number(),
				type: z.string(),
				daeval: z.string(),
			}),
		)
		.mutation(async ({ input }) => {
			return fetch(
				`http://localhost:8000/get_questionnaires?age=${input.age}&type=${input.type}&daeval=${input.daeval}`,
			).then((response) => response.json());
		}),
});
