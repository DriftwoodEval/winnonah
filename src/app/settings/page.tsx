import { Guard } from "@components/layout/Guard";
import { SettingsTabs } from "@components/settings/SettingsTabs";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
	title: "Settings",
};

export default function Settings() {
	return (
		<Guard>
			<Suspense>
				<SettingsTabs />
			</Suspense>
		</Guard>
	);
}
