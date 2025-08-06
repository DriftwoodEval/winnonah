import { asanaRouter } from "./routers/asana";
import { clientRouter } from "./routers/client";
import { evaluatorRouter } from "./routers/evaluator";
import { noteRouter } from "./routers/notes";
import { officeRouter } from "./routers/office";
import { pythonRouter } from "./routers/python";
import { questionnaireRouter } from "./routers/questionnaires";
import { createCallerFactory, createTRPCRouter } from "./trpc";

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
  questionnaires: questionnaireRouter,
  notes: noteRouter,
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
