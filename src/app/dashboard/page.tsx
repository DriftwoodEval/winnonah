import { Dashboard } from "@components/dashboard/Dashboard";
import { Guard } from "@components/layout/Guard";

export default async function Page() {
	return (
		<Guard permission="pages:dashboard">
			<Dashboard />
		</Guard>
	);
}
