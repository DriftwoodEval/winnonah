import { AuthRejection } from "@components/layout/AuthRejection";
import { auth } from "~/server/auth";
import SchedulingDisplay from "../_components/scheduling/SchedulingDisplay";

export default async function SchedulingPage() {
	const session = await auth();

	if (!session) {
		return <AuthRejection />;
	}

	return <SchedulingDisplay />;
}
