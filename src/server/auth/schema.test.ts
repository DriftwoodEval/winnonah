import { getTableColumns, is } from "drizzle-orm";
import { getTableConfig, MySqlTable } from "drizzle-orm/mysql-core";
import { describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({
	env: {
		AUTH_URL: "http://localhost:3000",
		AUTH_SECRET: "test-secret-test-secret-test-secret",
		AUTH_GOOGLE_ID: "id",
		AUTH_GOOGLE_SECRET: "secret",
		AUTH_GOOGLE_WORKSPACE_DOMAIN: "example.com",
	},
}));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/lib/integrations/redis", () => ({ redis: {} }));

const schema = await import("~/server/db/schema");
const { authInstance } = await import("./config");
const { tables } = await authInstance.$context;

const drizzleTables: Record<string, MySqlTable> = {
	user: schema.users,
	session: schema.sessions,
	account: schema.accounts,
	verification: schema.verifications,
};

describe("auth tables match the Drizzle schema", () => {
	it.each(Object.keys(drizzleTables))("%s", (model) => {
		const table = drizzleTables[model];
		expect(is(table, MySqlTable)).toBe(true);
		const columns = getTableColumns(table as MySqlTable);
		const expected = tables[model];
		expect(expected, `Better Auth has no ${model} table`).toBeDefined();

		// Every field Better Auth reads or writes needs a column.
		const fieldEntries = Object.entries(expected?.fields ?? {});
		const columnNames = fieldEntries.map(
			([key, field]) => field.fieldName ?? key,
		);
		const missing = columnNames.filter((name) => !(name in columns));
		expect(missing, `${model} is missing columns`).toEqual([]);

		// Better Auth looks records up by these and assumes there is only one.
		const uniqueColumns = new Set([
			...getTableConfig(table as MySqlTable)
				.indexes.filter((index) => index.config.unique)
				.flatMap((index) =>
					index.config.columns.length === 1
						? [(index.config.columns[0] as { name: string }).name]
						: [],
				),
			...Object.entries(columns)
				.filter(([, column]) => column.isUnique || column.primary)
				.map(([name]) => name),
		]);
		const notUnique = fieldEntries
			.filter(([, field]) => field.unique)
			.map(([key, field]) => field.fieldName ?? key)
			.filter((name) => !uniqueColumns.has(name));
		expect(notUnique, `${model} needs unique columns`).toEqual([]);

		// A column Better Auth never fills must not block an insert.
		const written = new Set(columnNames);
		const blocking = Object.entries(columns)
			.filter(([name]) => name !== "id" && !written.has(name))
			.filter(([, c]) => c.notNull && !c.hasDefault)
			.map(([name]) => name);
		expect(
			blocking,
			`${model} has required columns Better Auth never fills`,
		).toEqual([]);
	});
});
