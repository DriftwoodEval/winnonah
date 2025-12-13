import { AvailabilityForm } from "@components/availability/AvailabilityForm";
import { AvailabilityList } from "@components/availability/AvailabilityList";
import { AuthRejection } from "@components/layout/AuthRejection";
import { Separator } from "@ui/separator";
import { auth } from "~/server/auth";

export default async function Page() {
	const session = await auth();

	if (!session) {
		return <AuthRejection />;
	}

	return (
		<div className="m-4 flex flex-grow items-center justify-center">
			<div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
				<AvailabilityForm />
				<Separator className="lg:hidden" />
				<AvailabilityList />
			</div>
		</div>
	);
}
