import type { inferRouterOutputs } from "@trpc/server";
import type { InferSelectModel } from "drizzle-orm";
import type { clientRouter } from "~/server/api/routers/client";
import type {
  clients,
  evaluators,
  invitations,
  offices,
  schoolDistricts,
  users,
  zipCodes,
} from "~/server/db/schema";

type RouterOutput = inferRouterOutputs<typeof clientRouter>;

export type Client = InferSelectModel<typeof clients>;
export type SortedClient = RouterOutput["search"][0];

export type User = InferSelectModel<typeof users>;
export type Invitation = InferSelectModel<typeof invitations>;

export type Office = InferSelectModel<typeof offices>;
export type SchoolDistrict = InferSelectModel<typeof schoolDistricts>;
export type ZipCode = InferSelectModel<typeof zipCodes>;

type EvaluatorSchema = InferSelectModel<typeof evaluators>;

export type Evaluator = Omit<EvaluatorSchema, "offices"> & {
  offices: Office[];
  blockedDistricts: SchoolDistrict[];
  blockedZips: ZipCode[];
};
