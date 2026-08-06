import { appointmentRouter } from "./routers/appointments";
import { clientRouter } from "./routers/client";
import { evaluatorRouter } from "./routers/evaluator";
import { evaluatorDashboardRouter } from "./routers/evaluatorDashboard";
import { externalRecordRouter } from "./routers/externalRecords";
import { faxCategorizationRouter } from "./routers/faxCategorization";
import { googleRouter } from "./routers/google";
import { insuranceRouter } from "./routers/insurance";
import { insuranceReviewRouter } from "./routers/insuranceReview";
import { noteRouter } from "./routers/notes";
import { officeRouter } from "./routers/office";
import { pyConfigRouter } from "./routers/py-config";
import { questionnaireRouter } from "./routers/questionnaires";
import { quoRouter } from "./routers/quo";
import { referralFaxRouter } from "./routers/referralFax";
import { reminderRouter } from "./routers/reminders";
import { reportQueueRouter } from "./routers/reportQueue";
import { rolesRouter } from "./routers/roles";
import { schedulingRouter } from "./routers/scheduling";
import { sessionRouter } from "./routers/sessions";
import { systemRouter } from "./routers/system";
import { taskRouter } from "./routers/tasks";
import { userRouter } from "./routers/users";
import { workSummaryRouter } from "./routers/workSummary";
import { createCallerFactory, createTRPCRouter } from "./trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
	appointments: appointmentRouter,
	evaluatorDashboard: evaluatorDashboardRouter,
	clients: clientRouter,
	evaluators: evaluatorRouter,
	externalRecords: externalRecordRouter,
	faxCategorization: faxCategorizationRouter,
	google: googleRouter,
	insurances: insuranceRouter,
	insuranceReview: insuranceReviewRouter,
	notes: noteRouter,
	offices: officeRouter,
	workSummary: workSummaryRouter,
	reportQueue: reportQueueRouter,
	pyConfig: pyConfigRouter,
	questionnaires: questionnaireRouter,
	quo: quoRouter,
	referralFax: referralFaxRouter,
	reminders: reminderRouter,
	roles: rolesRouter,
	scheduling: schedulingRouter,
	sessions: sessionRouter,
	system: systemRouter,
	tasks: taskRouter,
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
