import { AuthRejection } from "@components/layout/AuthRejection";
import { ConfigEditor } from "@components/qsuite-config/ConfigEditor";
import { auth } from "~/server/auth";

export default async function QSuiteConfig() {
	const session = await auth();

	if (!session) {
		return <AuthRejection />;
	}

	return <ConfigEditor />;
}
