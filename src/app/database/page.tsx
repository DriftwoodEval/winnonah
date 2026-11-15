import { DatabasePage } from "@components/database/DatabasePage";
import { Guard } from "@components/layout/Guard";
import type { Metadata } from "next";
import { env } from "~/env";

export const metadata: Metadata = {
	title: `Database | ${env.NEXT_PUBLIC_APP_TITLE}`,
};

export default async function Page() {
	return (
		<Guard permission="pages:database">
			<DatabasePage />
		</Guard>
	);
}
