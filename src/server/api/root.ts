import { auditLogRouter } from "./routers/admin/auditLog";
import { googleRouter } from "./routers/admin/google";
import { insuranceRouter } from "./routers/admin/insurance";
import { listDismissalsRouter } from "./routers/admin/listDismissals";
import { postVisitAttachmentRouter } from "./routers/admin/postVisitAttachment";
import { pyConfigRouter } from "./routers/admin/py-config";
import { rolesRouter } from "./routers/admin/roles";
import { systemRouter } from "./routers/admin/system";
import { taskRouter } from "./routers/admin/tasks";
import { userRouter } from "./routers/admin/users";
import { adminReviewRouter } from "./routers/clients/adminReview";
import { babynetReportRouter } from "./routers/clients/babynetReport";
import { clientRouter } from "./routers/clients/client";
import { eiContactsRouter } from "./routers/clients/ei-contacts";
import { externalRecordRouter } from "./routers/clients/externalRecords";
import { noteRouter } from "./routers/clients/notes";
import { questionnaireRouter } from "./routers/clients/questionnaires";
import { quoRouter } from "./routers/clients/quo";
import { reminderRouter } from "./routers/clients/reminders";
import { sessionRouter } from "./routers/clients/sessions";
import { ddsQueueRouter } from "./routers/reports/ddsQueue";
import { evaluatorDashboardRouter } from "./routers/reports/evaluatorDashboard";
import { faxCategorizationRouter } from "./routers/reports/faxCategorization";
import { reportQueueRouter } from "./routers/reports/reportQueue";
import { reportsRouter } from "./routers/reports/reports";
import { workSummaryRouter } from "./routers/reports/workSummary";
import { appointmentRouter } from "./routers/scheduling/appointments";
import { evaluatorRouter } from "./routers/scheduling/evaluator";
import { greeterProxyRouter } from "./routers/scheduling/greeterProxy";
import { officeRouter } from "./routers/scheduling/office";
import { schedulingRouter } from "./routers/scheduling/scheduling";
import { schedulingHelperRouter } from "./routers/scheduling/schedulingHelper";
import { createCallerFactory, createTRPCRouter } from "./trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
	appointments: appointmentRouter,
	auditLog: auditLogRouter,
	babynetReport: babynetReportRouter,
	evaluatorDashboard: evaluatorDashboardRouter,
	clients: clientRouter,
	eiContacts: eiContactsRouter,
	evaluators: evaluatorRouter,
	externalRecords: externalRecordRouter,
	ddsQueue: ddsQueueRouter,
	faxCategorization: faxCategorizationRouter,
	google: googleRouter,
	greeterProxy: greeterProxyRouter,
	insurances: insuranceRouter,
	listDismissals: listDismissalsRouter,
	adminReview: adminReviewRouter,
	notes: noteRouter,
	offices: officeRouter,
	workSummary: workSummaryRouter,
	reportQueue: reportQueueRouter,
	reports: reportsRouter,
	postVisitAttachment: postVisitAttachmentRouter,
	pyConfig: pyConfigRouter,
	questionnaires: questionnaireRouter,
	quo: quoRouter,
	reminders: reminderRouter,
	roles: rolesRouter,
	scheduling: schedulingRouter,
	schedulingHelper: schedulingHelperRouter,
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
