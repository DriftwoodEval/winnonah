import { relations, sql } from "drizzle-orm";
import { index, mysqlTableCreator, primaryKey } from "drizzle-orm/mysql-core";
import type { AdapterAccount } from "next-auth/adapters";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = mysqlTableCreator((name) => `schedule_${name}`);

export const evaluators = createTable("evaluator", (d) => ({
	npi: d.varchar({ length: 255 }).notNull().primaryKey(),
	providerName: d.varchar({ length: 255 }).notNull(),
	SCM: d.boolean().notNull(),
	BABYNET: d.boolean().notNull(),
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
	id: d.varchar({ length: 255 }).notNull().primaryKey(),
	addedDate: d.date().notNull(),
	dob: d.date().notNull(),
	firstName: d.varchar({ length: 255 }).notNull(),
	lastName: d.varchar({ length: 255 }).notNull(),
	preferredName: d.varchar({ length: 255 }),
	fullName: d.varchar({ length: 255 }).notNull(),
	address: d.varchar({ length: 255 }),
	schoolDistrict: d.varchar({ length: 255 }),
	closestOffice: d.varchar({ length: 255 }),
	primaryInsurance: d.varchar({ length: 255 }),
	secondaryInsurance: d.varchar({ length: 255 }),
	privatePay: d.boolean().notNull().default(false),
}));

export const clientsEvaluators = createTable(
	"client_eval",
	(d) => ({
		id: d
			.varchar({ length: 255 })
			.notNull()
			.references(() => clients.id, { onDelete: "cascade" }),
		npi: d
			.varchar({ length: 255 })
			.notNull()
			.references(() => evaluators.npi, { onDelete: "cascade" }),
	}),
	(t) => [
		primaryKey({
			columns: [t.id, t.npi],
		}),
	],
);

export const posts = createTable(
	"post",
	(d) => ({
		id: d.bigint({ mode: "number" }).primaryKey().autoincrement(),
		name: d.varchar({ length: 256 }),
		createdById: d
			.varchar({ length: 255 })
			.notNull()
			.references(() => users.id),
		createdAt: d.timestamp().default(sql`CURRENT_TIMESTAMP`).notNull(),
		updatedAt: d.timestamp().onUpdateNow(),
	}),
	(t) => [
		index("created_by_idx").on(t.createdById),
		index("name_idx").on(t.name),
	],
);

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
