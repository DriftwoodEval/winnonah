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
import { AutismStopAlert } from "./AutismStopAlert";

const log = logger.child({ module: "Client" });

export function Client({
	hash,
	readOnly,
}: {
	hash: string;
	readOnly?: boolean;
}) {
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

	const updateClientColorMutation = api.clients.update.useMutation({
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
		<div className="flex w-[calc(100%-32px)] flex-col items-center gap-6 lg:w-[calc(100%-500px)]">
			<ClientHeader
				client={client}
				isLoading={isLoading}
				onColorChange={handleColorChange}
				readOnly={readOnly}
				selectedColor={selectedColor}
			/>

			{isLoading || !client ? (
				<Skeleton className="h-96 w-full rounded-md sm:h-96" />
			) : (
				<div className="mb-6 flex w-full flex-col items-center gap-6">
					<AutismStopAlert client={client} />

					{client.id.toString().length !== 5 && (
						<ClientDetailsCard client={client} />
					)}

					<ClientNoteEditor clientId={client.id} readOnly={readOnly} />

					{client.id.toString().length !== 5 && (
						<QuestionnairesSent clientId={client.id} readOnly={readOnly} />
					)}

					{client.id.toString().length !== 5 && (
						<EligibleEvaluatorsList client={client} />
					)}
				</div>
			)}
		</div>
	);
}
