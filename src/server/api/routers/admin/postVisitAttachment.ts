import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import {
	DEFAULT_POST_VISIT_MESSAGE,
	MAX_POST_VISIT_ATTACHMENT_BYTES,
} from "~/lib/constants";
import { hasPermission } from "~/lib/utils";
import { postVisitMessageConfigSchema } from "~/lib/validations/config";
import { diffValues, setAuditDetail } from "~/server/api/audit";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import type { db } from "~/server/db";
import { pythonConfig } from "~/server/db/schema";

// Subject and body live in the python config table so the cron can read them.
const MESSAGE_CONFIG_ID = 3;
const EDIT_PERMISSION = "settings:post-visit-attachment:edit";

async function loadMessage(database: typeof db) {
	const record = await database.query.pythonConfig.findFirst({
		where: eq(pythonConfig.id, MESSAGE_CONFIG_ID),
	});
	const parsed = postVisitMessageConfigSchema.safeParse(record?.data);
	return parsed.success ? parsed.data : DEFAULT_POST_VISIT_MESSAGE;
}

// The Python sidecar stores the PDF and enforces the edit permission and
// PDF check. These procedures forward the user's session cookie to it.
const PATH = "/post-visit-attachment";

// base64 inflates the file by 4/3.
const MAX_BASE64_LENGTH =
	Math.ceil((MAX_POST_VISIT_ATTACHMENT_BYTES * 4) / 3) + 4;

async function callSidecar(
	cookie: string | null,
	init: { method: "GET" } | { method: "PUT"; body: Uint8Array<ArrayBuffer> },
) {
	const res = await fetch(`${env.PY_API}${PATH}`, {
		...init,
		headers: { Cookie: cookie ?? "" },
	});
	if (!res.ok) {
		const { detail } = (await res.json().catch(() => ({}))) as {
			detail?: string;
		};
		throw new TRPCError({
			code: res.status === 403 ? "FORBIDDEN" : "BAD_REQUEST",
			message: detail ?? "Could not reach the attachment service",
		});
	}
	return (await res.json()) as { updatedAt: number | null };
}

export const postVisitAttachmentRouter = createTRPCRouter({
	getMessage: protectedProcedure.query(({ ctx }) => {
		if (!hasPermission(ctx.session.user.permissions, EDIT_PERMISSION)) {
			throw new TRPCError({ code: "FORBIDDEN" });
		}
		return loadMessage(ctx.db);
	}),

	setMessage: protectedProcedure
		.input(postVisitMessageConfigSchema)
		.mutation(async ({ ctx, input }) => {
			if (!hasPermission(ctx.session.user.permissions, EDIT_PERMISSION)) {
				throw new TRPCError({ code: "FORBIDDEN" });
			}
			setAuditDetail(ctx, diffValues(await loadMessage(ctx.db), input));
			await ctx.db
				.insert(pythonConfig)
				.values({ id: MESSAGE_CONFIG_ID, data: input })
				.onDuplicateKeyUpdate({ set: { data: input } });
			return { success: true };
		}),

	get: protectedProcedure.query(({ ctx }) =>
		callSidecar(ctx.headers.get("cookie"), { method: "GET" }),
	),

	set: protectedProcedure
		.input(z.object({ base64: z.string().min(1).max(MAX_BASE64_LENGTH) }))
		.mutation(({ ctx, input }) =>
			callSidecar(ctx.headers.get("cookie"), {
				method: "PUT",
				body: new Uint8Array(Buffer.from(input.base64, "base64")),
			}),
		),
});
