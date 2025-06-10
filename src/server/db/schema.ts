import { relations, sql } from "drizzle-orm";
import { index, mysqlTableCreator, primaryKey } from "drizzle-orm/mysql-core";
import type { AdapterAccount } from "next-auth/adapters";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = mysqlTableCreator((name) => `emr_${name}`);

export const evaluators = createTable("evaluator", (d) => ({
	npi: d.int().notNull().primaryKey(),
	providerName: d.varchar({ length: 255 }).notNull(),
	email: d.varchar({ length: 255 }).notNull().unique(),
	SCM: d.boolean().notNull(),
	BabyNet: d.boolean().notNull(),
	Molina: d.boolean().notNull(),
	MolinaMarketplace: d.boolean().notNull(),
	ATC: d.boolean().notNull(),
	Humana: d.boolean().notNull(),
	SH: d.boolean().notNull(),
	HB: d.boolean().notNull(),
	AETNA: d.boolean().notNull(),
	United_Optum: d.boolean().notNull(),
	Districts: d.varchar({ length: 255 }),
	Offices: d.varchar({ length: 255 }),
}));

export const clients = createTable("client", (d) => ({
	id: d.int().notNull().primaryKey(),
	hash: d.varchar({ length: 255 }).notNull(),
	asanaId: d.varchar({ length: 255 }),
	archivedInAsana: d.boolean().notNull().default(false),
	addedDate: d.date(),
	dob: d.date().notNull(),
	firstName: d.varchar({ length: 255 }).notNull(),
	lastName: d.varchar({ length: 255 }).notNull(),
	preferredName: d.varchar({ length: 255 }),
	fullName: d.varchar({ length: 255 }).notNull(),
	address: d.varchar({ length: 255 }),
	schoolDistrict: d.varchar({ length: 255 }),
	closestOffice: d.varchar({ length: 255 }),
	closestOfficeMiles: d.int(),
	secondClosestOffice: d.varchar({ length: 255 }),
	secondClosestOfficeMiles: d.int(),
	thirdClosestOffice: d.varchar({ length: 255 }),
	thirdClosestOfficeMiles: d.int(),
	primaryInsurance: d.varchar({ length: 255 }),
	secondaryInsurance: d.varchar({ length: 255 }),
	privatePay: d.boolean().notNull().default(false),
	asdAdhd: d.varchar({ length: 255 }),
	interpreter: d.boolean().notNull().default(false),
	phoneNumber: d.varchar({ length: 255 }),
	gender: d.mysqlEnum(["Male", "Female", "Other"]),
}));

export const appointments = createTable("appointment", (d) => ({
	id: d.int().notNull().autoincrement().primaryKey(),
	clientId: d
		.int()
		.notNull()
		.references(() => clients.id, { onDelete: "cascade" }),
	evaluatorNpi: d
		.int()
		.notNull()
		.references(() => evaluators.npi, { onDelete: "cascade" }),
	date: d.date().notNull(),
	status: d.varchar({ length: 255 }),
	type: d.mysqlEnum(["EVAL", "DA", "DAEVAL"]),
}));

export const questionnaires = createTable("questionnaire", (d) => ({
	id: d.int().notNull().autoincrement().primaryKey(),
	clientId: d
		.int()
		.notNull()
		.references(() => clients.id, { onDelete: "cascade" }),
	questionnaireType: d.varchar({ length: 255 }).notNull(),
	link: d.varchar({ length: 255 }).notNull(),
	sent: d.date(),
	completed: d.boolean().notNull().default(false),
	status: d.mysqlEnum(["PENDING", "COMPLETED", "RESCHEDULED"]),
}));

export const clientsEvaluators = createTable("client_eval", (d) => ({
	clientId: d
		.int()
		.notNull()
		.references(() => clients.id, { onDelete: "cascade" }),
	evaluatorNpi: d
		.int()
		.notNull()
		.references(() => evaluators.npi, { onDelete: "cascade" }),
}));

export const users = createTable("user", (d) => ({
	id: d
		.varchar({ length: 255 })
		.notNull()
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: d.varchar({ length: 255 }),
	email: d.varchar({ length: 255 }).notNull(),
	emailVerified: d
		.timestamp({
			mode: "date",
			fsp: 3,
		})
		.default(sql`CURRENT_TIMESTAMP(3)`),
	image: d.varchar({ length: 255 }),
}));

export const usersRelations = relations(users, ({ many }) => ({
	accounts: many(accounts),
	sessions: many(sessions),
}));

export const accounts = createTable(
	"account",
	(d) => ({
		userId: d
			.varchar({ length: 255 })
			.notNull()
			.references(() => users.id),
		type: d.varchar({ length: 255 }).$type<AdapterAccount["type"]>().notNull(),
		provider: d.varchar({ length: 255 }).notNull(),
		providerAccountId: d.varchar({ length: 255 }).notNull(),
		refresh_token: d.text(),
		access_token: d.text(),
		expires_at: d.int(),
		token_type: d.varchar({ length: 255 }),
		scope: d.varchar({ length: 255 }),
		id_token: d.text(),
		session_state: d.varchar({ length: 255 }),
	}),
	(t) => [
		primaryKey({
			columns: [t.provider, t.providerAccountId],
		}),
		index("account_user_id_idx").on(t.userId),
	],
);

export const accountsRelations = relations(accounts, ({ one }) => ({
	user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessions = createTable(
	"session",
	(d) => ({
		sessionToken: d.varchar({ length: 255 }).notNull().primaryKey(),
		userId: d
			.varchar({ length: 255 })
			.notNull()
			.references(() => users.id),
		expires: d.timestamp({ mode: "date" }).notNull(),
	}),
	(t) => [index("session_user_id_idx").on(t.userId)],
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const verificationTokens = createTable(
	"verification_token",
	(d) => ({
		identifier: d.varchar({ length: 255 }).notNull(),
		token: d.varchar({ length: 255 }).notNull(),
		expires: d.timestamp({ mode: "date" }).notNull(),
	}),
	(t) => [primaryKey({ columns: [t.identifier, t.token] })],
);
