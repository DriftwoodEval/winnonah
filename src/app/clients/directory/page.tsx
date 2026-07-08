import { ClientDirectory } from "@components/clients/ClientDirectory";
import { Guard } from "@components/layout/Guard";
import type { Metadata } from "next";
import { env } from "~/env";

export const metadata: Metadata = {
	title: `Client Directory | ${env.NEXT_PUBLIC_APP_TITLE}`,
};

export default async function Page() {
	return (
		<Guard>
			<ClientDirectory />
		</Guard>
	);
}
