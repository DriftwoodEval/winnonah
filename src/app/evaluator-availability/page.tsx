import { EvaluatorAvailabilityView } from "@components/availability/EvaluatorAvailabilityView";
import { Guard } from "@components/layout/Guard";

export default async function Page() {
	return (
		<Guard permission="pages:evaluator-availability">
			<div className="flex flex-1 flex-col p-4">
				<EvaluatorAvailabilityView />
			</div>
		</Guard>
	);
}
