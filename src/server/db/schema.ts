import { relations, sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  mysqlTableCreator,
  primaryKey,
} from "drizzle-orm/mysql-core";
import type { AdapterAccount } from "next-auth/adapters";
import { CLIENT_COLOR_KEYS } from "~/lib/colors";
import { type PermissionsObject, QUESTIONNAIRE_STATUSES } from "~/lib/types";

/**
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
  Aetna: d.boolean().notNull(),
  United_Optum: d.boolean().notNull(),
}));

export const schoolDistricts = createTable("school_district", (d) => ({
  id: d.int().notNull().primaryKey(),
  shortName: d.varchar({ length: 255 }),
  fullName: d.varchar({ length: 255 }).notNull(),
}));

export const zipCodes = createTable("zip_code", (d) => ({
  zip: d.varchar({ length: 5 }).notNull().primaryKey(),
}));

export const blockedSchoolDistricts = createTable(
  "blocked_school_district",
  (d) => ({
    evaluatorNpi: d.int().notNull(),
    schoolDistrictId: d.int().notNull(),
  }),
  (t) => [
    primaryKey({ columns: [t.evaluatorNpi, t.schoolDistrictId] }),
    foreignKey({
      columns: [t.evaluatorNpi],
      foreignColumns: [evaluators.npi],
      name: "blocked_districts_evaluator_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.schoolDistrictId],
      foreignColumns: [schoolDistricts.id],
      name: "blocked_districts_district_fk",
    }).onDelete("cascade"),
  ]
);

export const blockedZipCodes = createTable(
  "blocked_zip_code",
  (d) => ({
    evaluatorNpi: d
      .int()
      .notNull()
      .references(() => evaluators.npi, { onDelete: "cascade" }),
    zipCode: d
      .varchar({ length: 5 })
      .notNull()
      .references(() => zipCodes.zip, { onDelete: "cascade" }),
  }),
  (t) => [primaryKey({ columns: [t.evaluatorNpi, t.zipCode] })]
);

export const evaluatorRelations = relations(evaluators, ({ many }) => ({
  offices: many(evaluatorOffices),
  blockedSchoolDistricts: many(blockedSchoolDistricts),
  blockedZipCodes: many(blockedZipCodes),
}));

export const schoolDistrictRelations = relations(
  schoolDistricts,
  ({ many }) => ({
    blockedEvaluators: many(blockedSchoolDistricts),
  })
);

export const zipCodeRelations = relations(zipCodes, ({ many }) => ({
  blockedEvaluators: many(blockedZipCodes),
}));

export const blockedSchoolDistrictsRelations = relations(
  blockedSchoolDistricts,
  ({ one }) => ({
    evaluator: one(evaluators, {
      fields: [blockedSchoolDistricts.evaluatorNpi],
      references: [evaluators.npi],
    }),
    schoolDistrict: one(schoolDistricts, {
      fields: [blockedSchoolDistricts.schoolDistrictId],
      references: [schoolDistricts.id],
    }),
  })
);

export const blockedZipCodesRelations = relations(
  blockedZipCodes,
  ({ one }) => ({
    evaluator: one(evaluators, {
      fields: [blockedZipCodes.evaluatorNpi],
      references: [evaluators.npi],
    }),
    zipCode: one(zipCodes, {
      fields: [blockedZipCodes.zipCode],
      references: [zipCodes.zip],
    }),
  })
);

export const offices = createTable("office", (d) => ({
  key: d.varchar({ length: 255 }).notNull().primaryKey(),
  latitude: d.decimal({ precision: 10, scale: 8 }).notNull(),
  longitude: d.decimal({ precision: 11, scale: 8 }).notNull(),
  prettyName: d.varchar({ length: 255 }).notNull(),
}));

export const officesRelations = relations(offices, ({ many }) => ({
  evaluators: many(evaluatorOffices),
}));

export const evaluatorOffices = createTable(
  "evaluator_office",
  (d) => ({
    evaluatorNpi: d
      .int()
      .notNull()
      .references(() => evaluators.npi, { onDelete: "cascade" }),
    officeKey: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => offices.key, { onDelete: "cascade" }),
  }),
  (t) => [primaryKey({ columns: [t.evaluatorNpi, t.officeKey] })]
);

export const evaluatorOfficesRelations = relations(
  evaluatorOffices,
  ({ one }) => ({
    evaluator: one(evaluators, {
      fields: [evaluatorOffices.evaluatorNpi],
      references: [evaluators.npi],
    }),
    office: one(offices, {
      fields: [evaluatorOffices.officeKey],
      references: [offices.key],
    }),
  })
);

export const clients = createTable(
  "client",
  (d) => ({
    id: d.int().notNull().primaryKey(),
    hash: d.varchar({ length: 255 }).notNull(),
    status: d.boolean().notNull().default(true),
    asanaId: d.varchar({ length: 255 }),
    archivedInAsana: d.boolean().notNull().default(false),
    driveId: d.varchar({ length: 255 }),
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
    precertExpires: d.date(),
    privatePay: d.boolean().notNull().default(false),
    asdAdhd: d.mysqlEnum([
      "ASD",
      "ADHD",
      "ASD+ADHD",
      "ASD+LD",
      "ADHD+LD",
      "LD",
    ]),
    interpreter: d.boolean().notNull().default(false),
    phoneNumber: d.varchar({ length: 255 }),
    email: d.varchar({ length: 255 }),
    gender: d.mysqlEnum(["Male", "Female", "Other"]),
    color: d.mysqlEnum("color", CLIENT_COLOR_KEYS).notNull().default("gray"),
    highPriority: d.boolean().notNull().default(false),
    babyNet: d.boolean().notNull().default(false),
    autismStop: d.boolean().notNull().default(false),
    eiAttends: d.boolean().notNull().default(false),
    flag: d.varchar({ length: 255 }),
  }),
  (t) => [
    index("hash_idx").on(t.hash),
    index("district_idx").on(t.schoolDistrict),
    index("dob_idx").on(t.dob),
    index("added_date_idx").on(t.addedDate),
    index("insurance_idx").on(t.primaryInsurance),
  ]
);

export const notes = createTable(
  "note",
  (d) => ({
    clientId: d
      .int()
      .notNull()
      .primaryKey()
      .references(() => clients.id, { onDelete: "cascade" }),
    content: d.json("content"),
    title: d.text(),
    createdAt: d
      .timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d
      .timestamp("updated_at")
      .onUpdateNow()
      .default(sql`CURRENT_TIMESTAMP`),
  }),
  (t) => [index("note_client_idx").on(t.clientId)]
);

export const noteHistory = createTable(
  "note_history",
  (d) => ({
    id: d.int().notNull().autoincrement().primaryKey(),
    noteId: d
      .int()
      .notNull()
      .references(() => notes.clientId, { onDelete: "cascade" }),
    content: d.json("content").notNull(),
    title: d.text(),
    updatedBy: d.varchar("updated_by", { length: 255 }),
    createdAt: d
      .timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [index("note_history_note_idx").on(t.noteId)]
);

export const noteRelations = relations(notes, ({ one, many }) => ({
  client: one(clients, {
    fields: [notes.clientId],
    references: [clients.id],
  }),
  history: many(noteHistory),
}));

export const noteHistoryRelations = relations(noteHistory, ({ one }) => ({
  note: one(notes, {
    fields: [noteHistory.noteId],
    references: [notes.clientId],
  }),
}));

export const appointments = createTable("appointment", (d) => ({
  id: d.varchar({ length: 255 }).notNull().primaryKey(),
  clientId: d
    .int()
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  evaluatorNpi: d
    .int()
    .notNull()
    .references(() => evaluators.npi, { onDelete: "cascade" }),
  startTime: d.timestamp("startTime").notNull(),
  endTime: d.timestamp("endTime").notNull(),
  type: d.mysqlEnum(["EVAL", "DA", "LD"]),
  cpt: d.varchar({ length: 255 }),
  cancelled: d.boolean().notNull().default(false),
  location: d.varchar({ length: 255 }),
}));

export const questionnaires = createTable(
  "questionnaire",
  (d) => ({
    id: d.int().notNull().autoincrement().primaryKey(),
    clientId: d
      .int()
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    questionnaireType: d.varchar({ length: 255 }).notNull(),
    link: d.varchar({ length: 255 }),
    sent: d.date(),
    status: d.mysqlEnum(QUESTIONNAIRE_STATUSES).default("PENDING"),
    reminded: d.int().default(0),
    lastReminded: d.date(),
  }),
  (t) => [index("questionnaire_client_idx").on(t.clientId)]
);

export const failures = createTable(
  "failure",
  (d) => ({
    clientId: d
      .int()
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    reason: d.varchar({ length: 767 }).notNull(), // Max length for primary key
    daEval: d.mysqlEnum(["DA", "EVAL", "DAEVAL"]),
    failedDate: d.date().notNull(),
    reminded: d.int().default(0),
    lastReminded: d.date(),
  }),
  (t) => [primaryKey({ columns: [t.clientId, t.reason] })]
);

export const clientRelations = relations(clients, ({ many }) => ({
  questionnaires: many(questionnaires),
  failures: many(failures),
  clientsEvaluators: many(clientsEvaluators),
}));

export const questionnaireRelations = relations(questionnaires, ({ one }) => ({
  client: one(clients, {
    fields: [questionnaires.clientId],
    references: [clients.id],
  }),
}));

export const failureRelations = relations(failures, ({ one }) => ({
  client: one(clients, {
    fields: [failures.clientId],
    references: [clients.id],
  }),
}));

export const clientsEvaluators = createTable(
  "client_eval",
  (d) => ({
    clientId: d
      .int()
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    evaluatorNpi: d
      .int()
      .notNull()
      .references(() => evaluators.npi, { onDelete: "cascade" }),
  }),
  (t) => [primaryKey({ columns: [t.clientId, t.evaluatorNpi] })]
);

export const clientsEvaluatorsRelations = relations(
  clientsEvaluators,
  ({ one }) => ({
    client: one(clients, {
      fields: [clientsEvaluators.clientId],
      references: [clients.id],
    }),
    evaluator: one(evaluators, {
      fields: [clientsEvaluators.evaluatorNpi],
      references: [evaluators.npi],
    }),
  })
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
  evaluatorId: d.int().references(() => evaluators.npi),
  savedPlaces: d.json(),
  permissions: d.json("permissions").$type<PermissionsObject>(),
}));

export const usersRelations = relations(users, ({ many, one }) => ({
  accounts: many(accounts),
  sessions: many(sessions),

  evaluator: one(evaluators, {
    fields: [users.evaluatorId],
    references: [evaluators.npi],
  }),
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
  ]
);

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const invitations = createTable("invitation", (d) => ({
  id: d.int().notNull().autoincrement().primaryKey(),
  email: d.varchar({ length: 255 }).notNull().unique(),
  savedPlaces: d.json(),
  permissions: d.json("permissions").$type<PermissionsObject>(),
  status: d
    .mysqlEnum("status", ["pending", "accepted"])
    .notNull()
    .default("pending"),
  usedAt: d.timestamp(),
  createdAt: d
    .timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
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
    clientFilters: d.text(),
  }),
  (t) => [index("session_user_id_idx").on(t.userId)]
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
  (t) => [primaryKey({ columns: [t.identifier, t.token] })]
);
