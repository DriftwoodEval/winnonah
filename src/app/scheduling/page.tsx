import SchedulingDisplay from "@components/scheduling/SchedulingDisplay";
import { Guard } from "../_components/layout/Guard";

export default async function SchedulingPage() {
	return (
		<Guard permission="pages:scheduling">
			<SchedulingDisplay />
		</Guard>
	);
}
