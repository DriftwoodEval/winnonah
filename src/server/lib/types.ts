import type { InferSelectModel } from "drizzle-orm";
import type { clients } from "~/server/db/schema";

export type Client = InferSelectModel<typeof clients>;

export interface SortedClient extends Client {
  sortReason?: string;
}

export type Offices = {
  [key: string]: {
    latitude: string;
    longitude: string;
    prettyName: string;
  };
};
