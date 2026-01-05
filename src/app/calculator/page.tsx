import CostCalculator from "@components/calculator/CostCalculator";
import TimeCalculator from "@components/calculator/TimeCalculator";
import UnitCalculator from "@components/calculator/UnitCalculator";
import { AuthRejection } from "@components/layout/AuthRejection";
import { auth } from "~/server/auth";

export default async function Page() {
	const session = await auth();

	if (!session) {
		return <AuthRejection />;
	}

	return (
		<div className="container mx-auto p-4">
			<UnitCalculator />
			<CostCalculator />
			<TimeCalculator />
		</div>
	);
}
