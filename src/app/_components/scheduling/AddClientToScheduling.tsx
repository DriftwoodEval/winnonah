"use client";

import { useMemo } from "react";
import { api } from "~/trpc/react";
import { ClientSearchAndAdd } from "../clients/ClientSearchAndAdd";

export function AddClientToScheduling({
	onClientAdded,
}: {
	onClientAdded: () => void;
}) {
	const { data: scheduledData } = api.scheduling.get.useQuery();

	const scheduledClientIds = useMemo(() => {
		return scheduledData?.clients.map((c) => c.clientId) ?? [];
	}, [scheduledData]);

	const addClientMutation = api.scheduling.add.useMutation({
		onSuccess: () => {
			onClientAdded();
		},
	});

	return (
		<div className="max-w-md">
			<ClientSearchAndAdd
				addButtonLabel="Add"
				excludeIds={scheduledClientIds}
				floating={true}
				isAdding={addClientMutation.isPending}
				onAdd={(client) => addClientMutation.mutate({ clientId: client.id })}
				placeholder="Search for a client to add..."
				resetOnAdd={true}
			/>
		</div>
	);
}
