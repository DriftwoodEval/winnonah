import { Guard } from "@components/layout/Guard";
import { SchedulingHelper } from "@components/scheduling/SchedulingHelper";

export default async function Page() {
	return (
		<Guard permission="pages:scheduling">
			<div className="flex flex-1 flex-col p-4">
				<SchedulingHelper />
			</div>
		</Guard>
	);
}
