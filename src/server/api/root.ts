import { asanaRouter } from "~/server/api/routers/asana";
import {
	clientRouter,
	evaluatorRouter,
	officeRouter,
} from "~/server/api/routers/database";
import { pythonRouter } from "~/server/api/routers/python";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
	evaluators: evaluatorRouter,
	clients: clientRouter,
	offices: officeRouter,
	asana: asanaRouter,
	python: pythonRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
