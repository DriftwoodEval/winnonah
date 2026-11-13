import { Guard } from "@components/layout/Guard";
import { SettingsLayout } from "@components/settings/SettingsLayout";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
	title: "Settings",
};

export default function Settings() {
	return (
		<Guard>
			<Suspense>
				<SettingsLayout />
			</Suspense>
		</Guard>
	);
}
