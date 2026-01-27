import { clientRouter } from "./routers/client";
import { evaluatorRouter } from "./routers/evaluator";
import { externalRecordRouter } from "./routers/externalRecords";
import { googleRouter } from "./routers/google";
import { insuranceRouter } from "./routers/insurance";
import { noteRouter } from "./routers/notes";
import { officeRouter } from "./routers/office";
import { pyConfigRouter } from "./routers/py-config";
import { questionnaireRouter } from "./routers/questionnaires";
import { quoRouter } from "./routers/quo";
import { schedulingRouter } from "./routers/scheduling";
import { sessionRouter } from "./routers/sessions";
import { testUnitsRouter } from "./routers/testUnits";
import { userRouter } from "./routers/users";
import { createCallerFactory, createTRPCRouter } from "./trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
	clients: clientRouter,
	evaluators: evaluatorRouter,
	externalRecords: externalRecordRouter,
	google: googleRouter,
	insurances: insuranceRouter,
	notes: noteRouter,
	offices: officeRouter,
	pyConfig: pyConfigRouter,
	questionnaires: questionnaireRouter,
	quo: quoRouter,
	scheduling: schedulingRouter,
	sessions: sessionRouter,
	testUnits: testUnitsRouter,
	users: userRouter,
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
