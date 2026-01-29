import SchedulingDisplay from "@components/scheduling/SchedulingDisplay";
import { Suspense } from "react";
import { Guard } from "../_components/layout/Guard";

export default async function SchedulingPage() {
	return (
		<Guard permission="pages:scheduling">
			<Suspense>
				<SchedulingDisplay />
			</Suspense>
		</Guard>
	);
}
