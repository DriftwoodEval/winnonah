"use client";

import { api } from "~/trpc/react";
import { AddClientToScheduling } from "./AddClientToScheduling";
import { SchedulingTable } from "./SchedulingTable";

export default function SchedulingDisplay() {
	const utils = api.useUtils();

	const onClientAdded = () => {
		utils.scheduling.get.invalidate();
	};
	return (
		<div className="flex h-[calc(100vh-2.5rem)] w-full flex-col overflow-hidden px-5 pt-10 pb-5">
			<h1 className="mb-4 shrink-0 font-bold text-3xl">Scheduling</h1>
			<div className="mb-4 shrink-0">
				<AddClientToScheduling onClientAdded={onClientAdded} />
			</div>
			<div className="min-h-0 flex-1">
				<SchedulingTable />
			</div>
		</div>
	);
}
