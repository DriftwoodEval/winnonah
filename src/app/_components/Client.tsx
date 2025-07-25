"use client";

import { AsanaNotesEditor } from "@components/client/AsanaNotesEditor";
import { ClientDetailsCard } from "@components/client/ClientDetailsCard";
import { ClientHeader } from "@components/client/ClientHeader";
import { EligibleEvaluatorsList } from "@components/client/EligibleEvaluatorsList";
import { QuestionnairesSent } from "@components/client/QuestionnairesSent";
import { Skeleton } from "@components/ui/skeleton";
import { useEffect, useState } from "react";
import { api } from "~/trpc/react";

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
		data: asanaProject,
		isLoading: isLoadingAsanaProject,
		refetch: refetchAsanaProject,
	} = api.asana.getProject.useQuery(client?.asanaId ?? "", {
		enabled: !!client?.asanaId, // Only run query if asanaId exists
	});

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
				asanaProjectColorKey={selectedAsanaColorKey}
				client={client}
				isLoading={isLoading}
				onAsanaColorChange={updateAsanaColor}
			/>

			{isLoading || !client ? (
				<Skeleton className="h-96 w-[calc(100vw-32px)] rounded-md sm:h-96 sm:w-3xl" />
			) : (
				<>
					<ClientDetailsCard client={client} offices={offices} />

					{client.asanaId && <AsanaNotesEditor asanaId={client.asanaId} />}

					<QuestionnairesSent asanaId={client.asanaId} clientId={client.id} />

					<EligibleEvaluatorsList clientId={client.id} />
				</>
			)}
		</div>
	);
}
