import { and, eq, isNotNull, ne } from "drizzle-orm";
import { parsePrecertMemo } from "../src/lib/billing";
import { db } from "../src/server/db";
import { clientInsurancePolicies, clients } from "../src/server/db/schema";

async function main() {
	const rows = await db
		.select({
			clientId: clients.id,
			clientName: clients.fullName,
			policyId: clientInsurancePolicies.policyId,
			precertMemo: clientInsurancePolicies.precertMemo,
		})
		.from(clientInsurancePolicies)
		.innerJoin(clients, eq(clientInsurancePolicies.clientId, clients.id))
		.where(
			and(
				isNotNull(clientInsurancePolicies.precertMemo),
				ne(clientInsurancePolicies.precertMemo, ""),
			),
		);

	const unparsable = rows.filter(
		(r) => r.precertMemo && parsePrecertMemo(r.precertMemo) === null,
	);

	console.log(
		`Found ${unparsable.length} of ${rows.length} precert memos that parsePrecertMemo could not extract codes from.\n`,
	);

	for (const r of unparsable) {
		console.log(
			`Client ${r.clientId} (${r.clientName}), policy ${r.policyId}: "${r.precertMemo}"`,
		);
	}
}

main()
	.catch(console.error)
	.finally(() => process.exit(0));
