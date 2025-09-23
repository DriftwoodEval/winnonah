import { Merge } from "@components/clients/Merge";
import { AuthRejection } from "@components/layout/AuthRejection";
import { auth } from "~/server/auth";

export default async function Page() {
	const session = await auth();

	if (!session) {
		return <AuthRejection />;
	}

	return <Merge />;
}
