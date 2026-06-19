import type {
	assessmentTypes,
	clients,
	evaluators,
	failures,
	insurances,
	invitations,
	offices,
	questionnaires,
	schoolDistricts,
	users,
	zipCodes,
} from "~/server/db/schema";
import type { PUNCH_SCHEMA } from "./constants";

export type Client = typeof clients.$inferSelect;
export type Failure = typeof failures.$inferSelect;
export type Questionnaire = typeof questionnaires.$inferSelect;
export interface ClientWithIssueInfo extends Client {
	additionalInfo?: string;
	initialFailureDate?: Date;
}
export type FullClientInfo = PUNCH_SCHEMA &
	Client & {
		hasExternalRecordsNote?: boolean;
		externalRecordsRequestedDate?: string | null;
		failures?: Failure[];
		questionnaires?: Questionnaire[];
		hasPast96130Appt?: boolean;
	};

export type InsertingQuestionnaire = Pick<
	typeof questionnaires.$inferSelect,
	Exclude<keyof typeof questionnaires.$inferSelect, "id" | "updatedAt">
>;

type UserSchema = typeof users.$inferSelect;
export interface User extends UserSchema {
	evaluator?: typeof evaluators.$inferSelect | null;
}
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
	users?: Pick<User, "id" | "name" | "email">[];
}

export type AssessmentType = typeof assessmentTypes.$inferSelect;
