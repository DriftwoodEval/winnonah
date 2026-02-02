"use client";

import { useMemo } from "react";
import type { ScheduledClient, SortedClient } from "~/lib/api-types";
import { api } from "~/trpc/react";
import { ClientSearchAndAdd } from "../clients/ClientSearchAndAdd";

export function AddClientToScheduling({
	onClientAdded,
}: {
	onClientAdded: (clientId: number) => void;
}) {
	const { data: scheduledData } = api.scheduling.get.useQuery();

	const scheduledClientIds = useMemo(() => {
		return scheduledData?.clients.map((c) => c.clientId) ?? [];
	}, [scheduledData]);

	const utils = api.useUtils();
	const addClientMutation = api.scheduling.add.useMutation({
		onMutate: async (variables: {
			clientId: number;
			optimisticClient?: SortedClient;
		}) => {
			await utils.scheduling.get.cancel();
			const previousData = utils.scheduling.get.getData();

			// Optimistically update the cache if we have the client data
			if (variables.optimisticClient) {
				utils.scheduling.get.setData(undefined, (old) => {
					if (!old) return old;

					// Check if client is already in the list
					if (old.clients.some((c) => c.clientId === variables.clientId)) {
						return old;
					}

					const newScheduledClient: ScheduledClient = {
						clientId: variables.clientId,
						evaluator: null,
						archived: false,
						date: null,
						time: null,
						office: "",
						notes: null,
						code: null,
						color: null,
						createdAt: new Date(),
						client: {
							hash: variables.optimisticClient?.hash ?? "",
							fullName: variables.optimisticClient?.fullName ?? "",
							asdAdhd: variables.optimisticClient?.asdAdhd ?? null,
							primaryInsurance:
								variables.optimisticClient?.primaryInsurance ?? null,
							secondaryInsurance:
								variables.optimisticClient?.secondaryInsurance ?? null,
							schoolDistrict:
								variables.optimisticClient?.schoolDistrict ?? null,
							precertExpires:
								variables.optimisticClient?.precertExpires ?? null,
							dob: variables.optimisticClient?.dob ?? new Date(),
							closestOfficeKey: "",
						},
					};

					return {
						...old,
						clients: [...old.clients, newScheduledClient],
					};
				});
			}

			onClientAdded(variables.clientId);
			return { previousData };
		},

		onError: (_err, _variables, context) => {
			utils.scheduling.get.setData(undefined, context?.previousData);
		},

		onSettled: () => {
			utils.scheduling.get.invalidate();
		},
	});

	return (
		<div className="max-w-md">
			<ClientSearchAndAdd
				addButtonLabel="Add"
				excludeIds={scheduledClientIds}
				floating={true}
				isAdding={addClientMutation.isPending}
				onAdd={(client) =>
					addClientMutation.mutate({
						clientId: client.id,

						optimisticClient: client,
					} as any)
				}
				placeholder="Search for a client to add..."
				resetOnAdd={true}
			/>
		</div>
	);
}
