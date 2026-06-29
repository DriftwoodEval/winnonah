import { EvaluatorDashboard } from "@components/evaluator-dashboard/EvaluatorDashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Evaluator Dashboard",
};

export default async function Page() {
	return (
		<div className="flex grow flex-col items-center justify-start gap-4 px-4 py-6">
			<EvaluatorDashboard />
		</div>
	);
}
