import type {
	clients,
	evaluators,
	insurances,
	invitations,
	offices,
	questionnaires,
	schoolDistricts,
	testUnits,
	users,
	zipCodes,
} from "~/server/db/schema";
import type { PUNCH_SCHEMA } from "./constants";

export type Client = typeof clients.$inferSelect;
export interface ClientWithIssueInfo extends Client {
	additionalInfo?: string;
	initialFailureDate?: Date;
}
export type FullClientInfo = PUNCH_SCHEMA & Client;

export type InsertingQuestionnaire = Pick<
	typeof questionnaires.$inferSelect,
	Exclude<keyof typeof questionnaires.$inferSelect, "id" | "updatedAt">
>;

export type User = typeof users.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;

export type Office = typeof offices.$inferSelect;
export type SchoolDistrict = typeof schoolDistricts.$inferSelect;
export type ZipCode = typeof zipCodes.$inferSelect;
export type Insurance = typeof insurances.$inferSelect;
export interface InsuranceWithAliases extends Insurance {
	aliases: { name: string }[];
}

type EvaluatorSchema = typeof evaluators.$inferSelect;
export interface Evaluator extends EvaluatorSchema {
	offices: Office[];
	blockedDistricts: SchoolDistrict[];
	blockedZips: ZipCode[];
	insurances: Insurance[];
}

export type TestUnit = typeof testUnits.$inferSelect;
