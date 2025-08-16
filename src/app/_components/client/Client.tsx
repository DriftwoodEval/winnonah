"use client";

import { ClientDetailsCard } from "@components/client/ClientDetailsCard";
import { ClientHeader } from "@components/client/ClientHeader";
import { ClientNoteEditor } from "@components/client/ClientNoteEditor";
import { EligibleEvaluatorsList } from "@components/client/EligibleEvaluatorsList";
import { QuestionnairesSent } from "@components/client/QuestionnairesSent";
import { Skeleton } from "@ui/skeleton";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ClientColor } from "~/lib/colors";
import { logger } from "~/lib/logger";
import { api } from "~/trpc/react";

const log = logger.child({ module: "Client" });

export function Client({ hash }: { hash: string }) {
	// Data Fetching
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

	const updateClientColorMutation = api.clients.updateClient.useMutation({
		onSuccess: () => {
			refetchClient();
		},

		onError: (error) => {
			log.error(error, "Failed to update client color");
			toast.error("Failed to update color", {
				description: String(error.message),
			});
		},
	});

	const handleColorChange = (color: ClientColor) => {
		if (!client) return;
		setSelectedColor(color);
		updateClientColorMutation.mutate({ clientId: client.id, color });
	};

	const isLoading = isLoadingClient;

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
					<ClientDetailsCard client={client} />

					<ClientNoteEditor clientId={client.id} />

					<QuestionnairesSent clientId={client.id} />

					<EligibleEvaluatorsList clientId={client.id} />
				</div>
			)}
		</div>
	);
}
