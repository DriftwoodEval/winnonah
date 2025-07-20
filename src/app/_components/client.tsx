"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "~/app/_components/ui/skeleton";
import { api } from "~/trpc/react";
import { AsanaNotesEditor } from "./client/asanaNotesEditor";
import { ClientDetailsCard } from "./client/clientDetailsCard";
import { ClientHeader } from "./client/clientHeader";
import { EligibleEvaluatorsList } from "./client/eligibleEvaluatorsList";

export function Client({ hash }: { hash: string }) {
	// Data Fetching
	const { data: offices, isLoading: isLoadingOffices } =
		api.offices.getAll.useQuery();
	const { data: client, isLoading: isLoadingClient } =
		api.clients.getOne.useQuery({
			column: "hash",
			value: hash,
		});

	const {
		data: asanaProjectData,
		isLoading: isLoadingAsanaProject,
		refetch: refetchAsanaProject,
	} = api.asana.getProject.useQuery(client?.asanaId ?? "", {
		enabled: !!client?.asanaId, // Only run query if asanaId exists
	});
	const asanaProject = asanaProjectData?.data;

	// Asana Color State and Mutations
	const [selectedAsanaColorKey, setSelectedAsanaColorKey] = useState<
		string | null
	>(null);

	useEffect(() => {
		if (asanaProject?.color) {
			setSelectedAsanaColorKey(asanaProject.color);
		}
	}, [asanaProject?.color]);

	const mutateAsanaProject = api.asana.updateProject.useMutation({
		onSuccess: () => {
			refetchAsanaProject();
		},
		onError: (error) => {
			console.error("Failed to update Asana project:", error);
		},
	});

	const updateAsanaColor = (colorKey: string) => {
		setSelectedAsanaColorKey(colorKey);
		mutateAsanaProject.mutate({
			id: client?.asanaId ?? "",
			color: colorKey,
		});
	};

	const isLoading =
		isLoadingClient || isLoadingOffices || isLoadingAsanaProject;

	return (
		<div className="mx-10 flex flex-col gap-6">
			<ClientHeader
				client={client}
				asanaProjectColorKey={selectedAsanaColorKey}
				onAsanaColorChange={updateAsanaColor}
				isLoading={isLoading}
			/>

			{isLoading || !client ? ( // This check now covers the entire details section
				<Skeleton className="h-96 w-[calc(100vw-32px)] rounded-md sm:h-96 sm:w-3xl" />
			) : (
				<>
					<ClientDetailsCard client={client} offices={offices} />

					<EligibleEvaluatorsList clientId={client.id} />

					{client.asanaId && <AsanaNotesEditor asanaId={client.asanaId} />}
				</>
			)}
		</div>
	);
}
