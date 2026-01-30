import { Dashboard } from "@components/dashboard/Dashboard";
import { Guard } from "@components/layout/Guard";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Dashboard",
};

export default async function Page() {
	return (
		<Guard permission="pages:dashboard">
			<Dashboard />
		</Guard>
	);
}
