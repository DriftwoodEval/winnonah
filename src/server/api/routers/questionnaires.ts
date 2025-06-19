import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { formatClientAge } from "~/lib/utils";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { clients } from "~/server/db/schema";

export const questionnaireRouter = createTRPCRouter({
	getQuestionnaireList: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
			}),
		)
		.query(async ({ ctx, input }) => {
			interface QuestionnaireDetails {
				name: string;
				site: string;
				ageRanges: {
					min: number;
					max: number;
				};
			}
			const foundClient = await ctx.db.query.clients.findFirst({
				where: eq(clients.id, input.clientId),
			});

			if (!foundClient) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Client not found",
				});
			}

			const age = Number(formatClientAge(foundClient.dob, "years"));
			const QUESTIONNAIRES: QuestionnaireDetails[] = [
				{
					name: "DP-4",
					site: "WPS",
					ageRanges: {
						min: 0,
						max: 22,
					},
				},
				{
					name: "BASC Preschool",
					site: "QGlobal",
					ageRanges: { min: 0, max: 6 },
				},
				{ name: "BASC Child", site: "QGlobal", ageRanges: { min: 6, max: 12 } },
				{
					name: "BASC Adolescent",
					site: "QGlobal",
					ageRanges: { min: 12, max: 22 },
				},
				{
					name: "Conners EC",
					site: "MHS",
					ageRanges: { min: 0, max: 6 },
				},
				{
					name: "Conners 4",
					site: "MHS",
					ageRanges: { min: 6, max: 18 },
				},
				{
					name: "Conners 4 Self",
					site: "MHS",
					ageRanges: { min: 8, max: 18 },
				},
				{
					name: "ASRS (2-5 Years)",
					site: "MHS",
					ageRanges: { min: 2, max: 6 },
				},
				{
					name: "ASRS (6-18 Years)",
					site: "MHS",
					ageRanges: { min: 6, max: 19 },
				},
				{ name: "Vineland", site: "QGlobal", ageRanges: { min: 0, max: 80 } },
				{ name: "PAI", site: "Unknown", ageRanges: { min: 18, max: 99 } },
				{ name: "CAARS 2", site: "Unknown", ageRanges: { min: 18, max: 80 } },
				{ name: "SRS-2", site: "Unknown", ageRanges: { min: 19, max: 99 } },
				{ name: "SRS Self", site: "Unknown", ageRanges: { min: 19, max: 99 } },
				{ name: "ABAS 3", site: "Unknown", ageRanges: { min: 16, max: 89 } },
			];

			return QUESTIONNAIRES.filter(
				(q) => q.ageRanges.min < age && q.ageRanges.max > age,
			);
		}),
});
