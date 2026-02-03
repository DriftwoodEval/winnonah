import { AvailabilityForm } from "@components/availability/AvailabilityForm";
import { AvailabilityList } from "@components/availability/AvailabilityList";
import { Guard } from "@components/layout/Guard";
import { Separator } from "@ui/separator";

export default async function Page() {
	return (
		<Guard permission="pages:availability">
			<div className="m-4 flex flex-grow items-center justify-center">
				<div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
					<AvailabilityForm />
					<Separator className="lg:hidden" />
					<AvailabilityList />
				</div>
			</div>
		</Guard>
	);
}
