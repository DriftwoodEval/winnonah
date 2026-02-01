import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "~/server/api/root";

export type ClientRouterOutput = inferRouterOutputs<AppRouter>["clients"];
export type ClientWithOffice = ClientRouterOutput["getOne"];
export type SortedClient = ClientRouterOutput["search"]["clients"][0];

export type GoogleRouterOutput = inferRouterOutputs<AppRouter>["google"];
export type DuplicateDriveGroup = NonNullable<
	GoogleRouterOutput["findDuplicates"]
>["data"][number];

export type QuestionnaireRouterOutput =
	inferRouterOutputs<AppRouter>["questionnaires"];
export type DuplicateQLinksData = NonNullable<
	QuestionnaireRouterOutput["getDuplicateLinks"]
>;
export type SharedQuestionnaireData =
	DuplicateQLinksData["sharedAcrossClients"][number];

type SchedulingRouterOutput = inferRouterOutputs<AppRouter>["scheduling"];
export type ScheduledClient = SchedulingRouterOutput["get"]["clients"][number];
