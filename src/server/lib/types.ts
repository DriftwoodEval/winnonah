import type { inferRouterOutputs } from "@trpc/server";
import type { InferSelectModel } from "drizzle-orm";
import type { clientRouter } from "~/server/api/routers/client";
import type { clients, evaluators } from "~/server/db/schema";

type RouterOutput = inferRouterOutputs<typeof clientRouter>;

export type Client = InferSelectModel<typeof clients>;
export type SortedClient = RouterOutput["search"][0];

export type Evaluator = InferSelectModel<typeof evaluators>;

export type Offices = {
  [key: string]: {
    latitude: string;
    longitude: string;
    prettyName: string;
  };
};
