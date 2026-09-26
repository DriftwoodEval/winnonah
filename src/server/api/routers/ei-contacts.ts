import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { parseUsPhoneDigits } from "~/lib/utils";
import { diffValues, setAuditDetail } from "~/server/api/audit";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { eiContacts } from "~/server/db/schema";

export const eiContactsRouter = createTRPCRouter({
	list: protectedProcedure.query(({ ctx }) => {
		return ctx.db.select().from(eiContacts).orderBy(asc(eiContacts.name));
	}),

	upsert: protectedProcedure
		.input(
			z.object({
				id: z.number().optional(),
				name: z.string().min(1, "Name is required"),
				phoneNumber: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const digits = parseUsPhoneDigits(input.phoneNumber);
			if (!digits) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Phone number must be a valid 10-digit US number.",
				});
			}
			const data = { name: input.name, phoneNumber: digits };

			if (input.id) {
				const existing = await ctx.db.query.eiContacts.findFirst({
					where: eq(eiContacts.id, input.id),
				});
				setAuditDetail(ctx, diffValues(existing ?? {}, data));

				ctx.logger.info(
					{ ...input, updatedBy: ctx.session.user.email },
					"Updating EI contact",
				);
				await ctx.db
					.update(eiContacts)
					.set(data)
					.where(eq(eiContacts.id, input.id));
				return { id: input.id, ...data };
			}

			ctx.logger.info(
				{ ...input, createdBy: ctx.session.user.email },
				"Creating EI contact",
			);
			const result = await ctx.db.insert(eiContacts).values(data);
			return { id: result[0].insertId, ...data };
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			ctx.logger.info(
				{ ...input, deletedBy: ctx.session.user.email },
				"Deleting EI contact",
			);
			// clients.eiContactId is ON DELETE SET NULL, so this just unlinks
			// any client that had this contact selected.
			await ctx.db.delete(eiContacts).where(eq(eiContacts.id, input.id));
		}),
});
