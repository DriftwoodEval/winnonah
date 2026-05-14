import { Guard } from "@components/layout/Guard";
import { ConfigEditor } from "@components/qsuite-config/ConfigEditor";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
	title: "QSuite Config",
};

export default async function QSuiteConfig() {
	return (
		<Guard
			anyOf={[
				"settings:qsuite:general",
				"settings:qsuite:services",
				"settings:qsuite:records",
				"settings:qsuite:piecework",
			]}
		>
			<Suspense>
				<ConfigEditor />
			</Suspense>
		</Guard>
	);
}
