import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import { fetchWithCache, invalidateCache } from "~/lib/cache";
import { CACHE_KEY_ALL_EVALUATORS } from "~/server/api/routers/scheduling/evaluator";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import { officeDriveTimes, offices } from "~/server/db/schema";

const CACHE_KEY_ALL_OFFICES = "offices:all";

const officeFields = z.object({
	prettyName: z.string().trim().min(1).max(255),
	address: z.string().trim().min(1).max(500),
	locationPhrase: z.string().trim().max(500).nullable(),
	latitude: z.number().min(-90).max(90),
	longitude: z.number().min(-180).max(180),
});

const slugify = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

export const officeRouter = createTRPCRouter({
	// Archived offices are left out unless asked for: pickers want only active
	// offices, while name lookups for past data need every office.
	getAll: protectedProcedure
		.input(z.object({ includeArchived: z.boolean().default(false) }).optional())
		.query(async ({ ctx, input }) => {
			const allOffices = await fetchWithCache(
				ctx,
				CACHE_KEY_ALL_OFFICES,
				() => {
					return ctx.db.query.offices.findMany({});
				},
			);

			return input?.includeArchived
				? allOffices
				: allOffices.filter((office) => !office.archived);
		}),

	setArchived: protectedProcedure
		.input(z.object({ key: z.string(), archived: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "settings:evaluators");
			ctx.logger.info(
				{ ...input, changedBy: ctx.session.user.email },
				input.archived ? "Archiving office" : "Unarchiving office",
			);
			await ctx.db
				.update(offices)
				.set({ archived: input.archived })
				.where(eq(offices.key, input.key));
			await invalidateCache(
				ctx,
				CACHE_KEY_ALL_OFFICES,
				CACHE_KEY_ALL_EVALUATORS,
			);
		}),

	// Candidate addresses from the Python sidecar's geocoder, for the person
	// editing an office to confirm before saving.
	lookupAddress: protectedProcedure
		.input(z.object({ query: z.string().trim().min(5) }))
		.query(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "settings:evaluators");
			const response = await fetch(
				`${env.PY_API}/offices/address-lookup?q=${encodeURIComponent(input.query)}`,
				{ headers: { Cookie: ctx.headers.get("cookie") ?? "" } },
			);
			if (!response.ok) {
				throw new Error("Address lookup failed");
			}
			return response.json() as Promise<
				{
					formattedAddress: string;
					latitude: number;
					longitude: number;
					accuracy: number;
				}[]
			>;
		}),

	create: protectedProcedure
		.input(officeFields)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "settings:evaluators");
			const key = slugify(input.prettyName);
			if (!key) {
				throw new Error("Office name needs letters or numbers");
			}
			const existing = await ctx.db.query.offices.findFirst({
				where: (o, { eq }) => eq(o.key, key),
			});
			if (existing) {
				throw new Error("An office with that name already exists");
			}
			ctx.logger.info(
				{ key, changedBy: ctx.session.user.email },
				"Creating office",
			);
			await ctx.db.insert(offices).values({
				key,
				prettyName: input.prettyName,
				address: input.address,
				locationPhrase: input.locationPhrase || null,
				latitude: String(input.latitude),
				longitude: String(input.longitude),
			});
			await invalidateCache(ctx, CACHE_KEY_ALL_OFFICES);
		}),

	update: protectedProcedure
		.input(officeFields.extend({ key: z.string() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "settings:evaluators");
			const { key, ...fields } = input;
			const current = await ctx.db.query.offices.findFirst({
				where: (o, { eq }) => eq(o.key, key),
			});
			if (!current) {
				throw new Error("Office not found");
			}
			ctx.logger.info(
				{ key, changedBy: ctx.session.user.email },
				"Updating office",
			);
			await ctx.db
				.update(offices)
				.set({
					prettyName: fields.prettyName,
					address: fields.address,
					locationPhrase: fields.locationPhrase || null,
					latitude: String(fields.latitude),
					longitude: String(fields.longitude),
				})
				.where(eq(offices.key, key));
			// Cached drive times were computed from the old location, so clear
			// them and let the drive time backfill recompute.
			if (
				Number(current.latitude) !== fields.latitude ||
				Number(current.longitude) !== fields.longitude
			) {
				await ctx.db
					.delete(officeDriveTimes)
					.where(eq(officeDriveTimes.officeKey, key));
			}
			await invalidateCache(
				ctx,
				CACHE_KEY_ALL_OFFICES,
				CACHE_KEY_ALL_EVALUATORS,
				`office:key:${key}`,
				`office:prettyName:${current.prettyName}`,
				`office:prettyName:${fields.prettyName}`,
			);
		}),

	getOne: protectedProcedure
		.input(
			z.object({
				column: z.enum(["key", "prettyName"]),
				value: z.string().min(1),
			}),
		)
		.query(async ({ ctx, input }) => {
			const cacheKey = `office:${input.column}:${input.value}`;

			return fetchWithCache(ctx, cacheKey, async () => {
				const office = await ctx.db.query.offices.findFirst({
					where: (o, { eq }) => eq(o[input.column], input.value),
				});

				if (!office) {
					throw new Error("Office not found");
				}

				return office;
			});
		}),
});
