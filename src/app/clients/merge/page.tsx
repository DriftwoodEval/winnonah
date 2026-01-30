import { Merge } from "@components/clients/Merge";
import { Guard } from "@components/layout/Guard";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Merge Clients",
};

export default async function Page() {
	return (
		<Guard>
			<Merge />
		</Guard>
	);
}
