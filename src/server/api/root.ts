import { clientRouter } from "./routers/client";
import { evaluatorRouter } from "./routers/evaluator";
import { googleRouter } from "./routers/google";
import { noteRouter } from "./routers/notes";
import { officeRouter } from "./routers/office";
import { questionnaireRouter } from "./routers/questionnaires";
import { userRouter } from "./routers/users";
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
  questionnaires: questionnaireRouter,
  notes: noteRouter,
  users: userRouter,
  google: googleRouter,
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
