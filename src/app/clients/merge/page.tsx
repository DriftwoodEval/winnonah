import { Merge } from "@components/clients/Merge";
import { Guard } from "@components/layout/Guard";

export default async function Page() {
	return (
		<Guard>
			<Merge />
		</Guard>
	);
}
