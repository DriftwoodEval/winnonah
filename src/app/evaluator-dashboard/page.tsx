import { EvaluatorDashboard } from "@components/evaluator-dashboard/EvaluatorDashboard";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "~/server/db";
import { evaluators } from "~/server/db/schema";

export async function generateMetadata(): Promise<Metadata> {
	const evaluator = await db.query.evaluators.findFirst({
		where: eq(evaluators.evaluatorDashboard, true),
		columns: { providerName: true },
	});
	const firstName = evaluator?.providerName?.split(" ")[0];
	return {
		title: firstName ? `${firstName}'s Report Dashboard` : "Report Dashboard",
	};
}

export default async function Page() {
	return (
		<div className="flex grow flex-col items-center justify-start gap-4 px-4 py-6">
			<EvaluatorDashboard />
		</div>
	);
}
