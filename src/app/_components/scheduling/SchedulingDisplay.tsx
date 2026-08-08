"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { AddClientToScheduling } from "./AddClientToScheduling";
import { SchedulingTable } from "./SchedulingTable";

export default function SchedulingDisplay() {
	const utils = api.useUtils();
	const [lastAddedClientId, setLastAddedClientId] = useState<number | null>(
		null,
	);

	const onClientAdded = (clientId: number) => {
		setLastAddedClientId(clientId);
		utils.scheduling.get.invalidate();
	};
	return (
		<div className="flex h-[calc(100vh-2.5rem)] w-full flex-col overflow-hidden px-3 pt-10 pb-3 sm:px-5 sm:pb-5">
			<h1 className="mb-2 shrink-0 font-bold text-xl sm:mb-4 sm:text-3xl">
				Scheduling
			</h1>
			<div className="mb-2 shrink-0 sm:mb-4">
				<AddClientToScheduling onClientAdded={onClientAdded} />
			</div>
			<div className="min-h-0 flex-1">
				<SchedulingTable
					lastAddedClientId={lastAddedClientId}
					onScrollToClient={() => setLastAddedClientId(null)}
				/>
			</div>
		</div>
	);
}
