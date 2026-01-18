import CostCalculator from "@components/calculator/CostCalculator";
import TimeCalculator from "@components/calculator/TimeCalculator";
import UnitCalculator from "@components/calculator/UnitCalculator";
import { Guard } from "@components/layout/Guard";

export default async function Page() {
	return (
		<Guard permission="pages:calculator">
			<div className="container mx-auto p-4">
				<UnitCalculator />
				<CostCalculator />
				<TimeCalculator />
			</div>
		</Guard>
	);
}
