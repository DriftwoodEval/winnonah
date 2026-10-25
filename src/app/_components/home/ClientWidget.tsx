"use client";

import { ClientsDashboard } from "@components/clients/ClientsDashboard";

export function ClientWidget() {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			<ClientsDashboard />
		</div>
	);
}
