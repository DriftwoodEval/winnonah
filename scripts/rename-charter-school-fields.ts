import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "~/env";
import * as schema from "~/server/db/schema";

// One-off rename for the "private school" -> "charter school" terminology
// change. Renames every stored name tied to the old wording so the app code
// (which now only reads/writes the new names) keeps working for existing
// data. Must run in the same deploy window as that code change: before it,
// nothing reads the new names yet; after it, nothing reads the old ones.
//
// Dry run by default. Pass --apply to write.
const APPLY = process.argv.includes("--apply");

const OLD_PERMISSION_IDS = [
	"clients:referral:confirmprivateschool",
	"issues:private-school-confirm",
] as const;
const NEW_PERMISSION_IDS = [
	"clients:referral:confirmcharterschool",
	"issues:charter-school-confirm",
] as const;

const OLD_WIDGET_ID = "private-school-confirm";
const NEW_WIDGET_ID = "charter-school-confirm";

async function renameReferralDataKeys(
	db: ReturnType<typeof drizzle<typeof schema>>,
) {
	const [rows] = await db.execute(sql`
		SELECT id FROM emr_client
		WHERE JSON_CONTAINS_PATH(referralData, 'one', '$.privateSchool', '$.privateSchoolConfirmed')
	`);
	const ids = (rows as { id: number }[]).map((r) => r.id);
	console.log(`referralData: ${ids.length} client(s) with old keys.`);
	if (!APPLY || ids.length === 0) return;

	await db.execute(sql`
		UPDATE emr_client
		SET referralData = JSON_REMOVE(
			JSON_SET(
				referralData,
				'$.charterSchool', JSON_EXTRACT(referralData, '$.privateSchool'),
				'$.charterSchoolConfirmed', JSON_EXTRACT(referralData, '$.privateSchoolConfirmed')
			),
			'$.privateSchool', '$.privateSchoolConfirmed'
		)
		WHERE JSON_CONTAINS_PATH(referralData, 'one', '$.privateSchool', '$.privateSchoolConfirmed')
	`);
	console.log(`referralData: renamed keys on ${ids.length} client(s).`);
}

async function renamePermissionIds(
	db: ReturnType<typeof drizzle<typeof schema>>,
	table: "emr_role" | "emr_user" | "emr_invitation",
) {
	for (const [oldId, newId] of OLD_PERMISSION_IDS.map(
		(id, i) => [id, NEW_PERMISSION_IDS[i]] as const,
	)) {
		const [rows] = await db.execute(
			sql.raw(
				`SELECT id FROM ${table} WHERE JSON_CONTAINS_PATH(permissions, 'one', '$."${oldId}"')`,
			),
		);
		const ids = (rows as { id: number }[]).map((r) => r.id);
		console.log(`${table}.permissions: ${ids.length} row(s) with "${oldId}".`);
		if (!APPLY || ids.length === 0) continue;

		await db.execute(
			sql.raw(`
				UPDATE ${table}
				SET permissions = JSON_REMOVE(
					JSON_SET(permissions, '$."${newId}"', JSON_EXTRACT(permissions, '$."${oldId}"')),
					'$."${oldId}"'
				)
				WHERE JSON_CONTAINS_PATH(permissions, 'one', '$."${oldId}"')
			`),
		);
		console.log(
			`${table}.permissions: renamed "${oldId}" -> "${newId}" on ${ids.length} row(s).`,
		);
	}
}

async function renameHomeWidgetId(
	db: ReturnType<typeof drizzle<typeof schema>>,
) {
	const [rows] = await db.execute(
		sql`SELECT id, homeWidgets FROM emr_user WHERE homeWidgets LIKE ${`%${OLD_WIDGET_ID}%`}`,
	);
	const users = rows as { id: number; homeWidgets: string }[];
	console.log(
		`emr_user.homeWidgets: ${users.length} user(s) with the old widget id.`,
	);
	if (!APPLY) return;

	for (const user of users) {
		const widgets = JSON.parse(user.homeWidgets) as { id: string }[];
		const renamed = widgets.map((w) =>
			w.id === OLD_WIDGET_ID ? { ...w, id: NEW_WIDGET_ID } : w,
		);
		await db.execute(
			sql`UPDATE emr_user SET homeWidgets = ${JSON.stringify(renamed)} WHERE id = ${user.id}`,
		);
	}
	console.log(
		`emr_user.homeWidgets: renamed widget id on ${users.length} user(s).`,
	);
}

async function run() {
	console.log(
		`Renaming private-school -> charter-school...${APPLY ? "" : " [DRY RUN]"}`,
	);

	const connection = await mysql.createConnection(env.DATABASE_URL);
	const db = drizzle(connection, { schema, mode: "default" });

	await renameReferralDataKeys(db);
	await renamePermissionIds(db, "emr_role");
	await renamePermissionIds(db, "emr_user");
	await renamePermissionIds(db, "emr_invitation");
	await renameHomeWidgetId(db);

	await connection.end();
}

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
