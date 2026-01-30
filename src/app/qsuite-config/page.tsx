import { Guard } from "@components/layout/Guard";
import { ConfigEditor } from "@components/qsuite-config/ConfigEditor";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
	title: "QSuite Config",
};

export default async function QSuiteConfig() {
	return (
		<Guard permission="pages:qsuite-config">
			<Suspense>
				<ConfigEditor />
			</Suspense>
		</Guard>
	);
}
