import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const greeterProxyRouter = createTRPCRouter({
	getSchedule: protectedProcedure
		.input(z.object({ date: z.string() }).optional())
		.query(async ({ input }) => {
			const url = new URL(`${env.PY_API}/pyapi/greeter-proxy/schedule`);
			if (input?.date) url.searchParams.set("date", input.date);

			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`Failed to fetch greeter schedule: ${response.status}`);
			}
			const data = (await response.json()) as {
				entries: { location: string; name: string; phone: string | null }[];
			};
			return data.entries;
		}),
});
