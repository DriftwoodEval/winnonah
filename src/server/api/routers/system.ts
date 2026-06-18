import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { SERVER_START_TIME, systemEmitter } from "~/server/systemEmitter";

export const systemRouter = createTRPCRouter({
	onSystemUpdate: protectedProcedure.subscription(async function* ({
		ctx,
		signal,
	}) {
		const userId = ctx.session.user.id;

		yield { type: "restart" as const, serverStartTime: SERVER_START_TIME };

		const eventQueue: Array<{ type: "permissionChange" }> = [];
		let resolveNext: (() => void) | null = null;

		const onPermissionChange = (changedUserId: string) => {
			if (changedUserId === userId) {
				eventQueue.push({ type: "permissionChange" });
				if (resolveNext) {
					resolveNext();
					resolveNext = null;
				}
			}
		};

		systemEmitter.on("permissionChange", onPermissionChange);

		try {
			while (!signal?.aborted) {
				if (eventQueue.length === 0) {
					await new Promise<void>((resolve) => {
						resolveNext = resolve;
						signal?.addEventListener("abort", () => resolve(), { once: true });
					});
				}

				while (eventQueue.length > 0) {
					const event = eventQueue.shift();
					if (event) yield event;
				}
			}
		} finally {
			systemEmitter.off("permissionChange", onPermissionChange);
		}
	}),
});
