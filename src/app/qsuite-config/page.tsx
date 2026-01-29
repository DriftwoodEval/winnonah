import { Guard } from "@components/layout/Guard";
import { ConfigEditor } from "@components/qsuite-config/ConfigEditor";
import { Suspense } from "react";

export default async function QSuiteConfig() {
	return (
		<Guard permission="pages:qsuite-config">
			<Suspense>
				<ConfigEditor />
			</Suspense>
		</Guard>
	);
}
