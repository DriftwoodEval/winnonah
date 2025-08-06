"use client";

import { ClientDetailsCard } from "@components/client/ClientDetailsCard";
import { ClientHeader } from "@components/client/ClientHeader";
import { ClientNoteEditor } from "@components/client/ClientNoteEditor";
import { EligibleEvaluatorsList } from "@components/client/EligibleEvaluatorsList";
import { QuestionnairesSent } from "@components/client/QuestionnairesSent";
import { Skeleton } from "@components/ui/skeleton";
import { useEffect, useState } from "react";
import type { ClientColor } from "~/lib/colors";
import { api } from "~/trpc/react";

export function Client({ hash }: { hash: string }) {
	// Data Fetching
	const { data: offices, isLoading: isLoadingOffices } =
		api.offices.getAll.useQuery();
	const {
		data: client,
		isLoading: isLoadingClient,
		refetch: refetchClient,
	} = api.clients.getOne.useQuery({
		column: "hash",
		value: hash,
	});

	const [selectedColor, setSelectedColor] = useState<ClientColor | null>(null);

	useEffect(() => {
		if (client?.color) {
			setSelectedColor(client.color);
		}
	}, [client?.color]);

	const updateClientColorMutation = api.clients.updateColor.useMutation({
		onSuccess: () => {
			refetchClient();
		},

		onError: (error) => {
			console.error("Failed to update client color:", error);
			// TODO: Add a toast notification for the user
		},
	});

	const handleColorChange = (color: ClientColor) => {
		if (!client) return;
		setSelectedColor(color);
		updateClientColorMutation.mutate({ hash: client.hash, color });
	};

	const isLoading = isLoadingClient || isLoadingOffices;

	return (
		<div className="mx-10 flex flex-col gap-6">
			<ClientHeader
				client={client}
				isLoading={isLoading}
				onColorChange={handleColorChange}
				selectedColor={selectedColor}
			/>

			{isLoading || !client ? (
				<Skeleton className="h-96 w-[calc(100vw-32px)] rounded-md sm:h-96 lg:w-4xl" />
			) : (
				<div className="flex w-[calc(100vw-32px)] flex-col items-center gap-6 lg:w-4xl">
					<ClientDetailsCard client={client} offices={offices} />

					<ClientNoteEditor clientId={client.id} />

					<QuestionnairesSent clientId={client.id} />

					<EligibleEvaluatorsList clientId={client.id} />
				</div>
			)}
		</div>
	);
}
