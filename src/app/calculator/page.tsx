"use client";

import CostCalculator from "@components/calculator/CostCalculator";
import UnitCalculator from "@components/calculator/UnitCalculator";

export default function CalculatorPage() {
	return (
		<div className="container mx-auto p-4">
			<UnitCalculator />
			<CostCalculator />
		</div>
	);
}
