import { AuthRejection } from "@components/layout/AuthRejection";
import { auth } from "~/server/auth";
import { AvailabilityForm } from "../_components/availability/AvailabilityForm";

export default async function Page() {
	const session = await auth();

	if (!session) {
		return <AuthRejection />;
	}

	return <AvailabilityForm />;
}
