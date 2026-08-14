import { AvailabilityPageTabs } from "@components/availability/AvailabilityPageTabs";
import { Guard } from "@components/layout/Guard";
import { Suspense } from "react";

export default async function Page() {
	return (
		<Guard permission="pages:availability">
			<div className="m-4 flex grow justify-center">
				<Suspense>
					<AvailabilityPageTabs />
				</Suspense>
			</div>
		</Guard>
	);
}
