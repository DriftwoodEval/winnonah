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
		<div className="container mx-5 py-10">
			<h1 className="mb-4 font-bold text-3xl">Scheduling</h1>
			<div className="mb-8">
				<AddClientToScheduling onClientAdded={onClientAdded} />
			</div>
			<SchedulingTable />
		</div>
	);
}
