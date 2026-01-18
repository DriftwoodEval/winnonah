import { Guard } from "@components/layout/Guard";
import { ConfigEditor } from "@components/qsuite-config/ConfigEditor";

export default async function QSuiteConfig() {
	return (
		<Guard permission="pages:qsuite-config">
			<ConfigEditor />
		</Guard>
	);
}
