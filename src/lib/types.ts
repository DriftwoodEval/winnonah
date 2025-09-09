import type { InferSelectModel } from "drizzle-orm";
import type { clients } from "~/server/db/schema";

export const userRoles = ["user", "evaluator", "admin", "superadmin"] as const;
export type UserRole = (typeof userRoles)[number];

export type PunchClient = {
  "Client Name": string | undefined;
  "Client ID": string | undefined;
  For: string | undefined;
  Language: string | undefined;
  "DA Qs Needed": string | undefined;
  "DA Qs Sent": string | undefined;
  "DA Qs Done": string | undefined;
  "DA Scheduled": string | undefined;
  "EVAL Qs Needed": string | undefined;
  "EVAL Qs Sent": string | undefined;
  "EVAL Qs Done": string | undefined;
  "PA Assigned to": string | undefined;
  "PA Requested? (Aetna, ADHD,BabyNet, Molina, PP-N/A)": string | undefined;
  "Primary Payer": string | undefined;
  "Secondary Payer": string | undefined;
  "Records Requested?": string | undefined;
  "Records Reviewed?": string | undefined;
  "EVAL date": string | undefined;
  Location: string | undefined;
  Comments: string | undefined;
  "DA IN FOLDER/ NEEDS REPT WRITTEN": string | undefined;
  "Protocols scanned?": string | undefined;
  "Ready to assign?": string | undefined;
  Evaluator: string | undefined;
  "Assigned to OR added to report writing folder": string | undefined;
  "MCS Review Needed": string | undefined;
  "AJP Review Done": string | undefined;
  "BRIDGES billed?": string | undefined;
  "Billed?": string | undefined;
  hash: string;
};

export type DBClient = InferSelectModel<typeof clients>;

// Combined type for the final result
export type FullClientInfo = PunchClient & DBClient;
