"use client";

import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import { Skeleton } from "@ui/skeleton";
import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ClientColor } from "~/lib/colors";
import { logger } from "~/lib/logger";
import { getLocalDayFromUTCDate } from "~/lib/utils";
import { api } from "~/trpc/react";
import { AutismStopAlert } from "./AutismStopAlert";
import { ClientDetailsCard } from "./ClientDetailsCard";
import { ClientHeader } from "./ClientHeader";
import { ClientNoteEditor } from "./ClientNoteEditor";
import { EligibleEvaluatorsList } from "./EligibleEvaluatorsList";
import { QuestionnairesSent } from "./QuestionnairesSent";

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
				duration: 10000,
			});
		},
	});

	const handleColorChange = (color: ClientColor) => {
		if (!client) return;
		setSelectedColor(color);
		updateClientColorMutation.mutate({ clientId: client.id, color });
	};

	const { data: clientFailures } = api.clients.getFailures.useQuery(
		client?.id ?? undefined,
	);

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

					{clientFailures?.map((failure) => {
						if (
							failure.reason === "docs not signed" ||
							failure.reason === "portal not opened"
						) {
							const reasonText = `${failure.reason?.replace(
								/^\S/g,
								(c) => c.toUpperCase() + c.toLowerCase().slice(1),
							)}.`;

							const formattedUpdatedDate =
								getLocalDayFromUTCDate(failure.updatedAt)?.toLocaleDateString(
									undefined,
									{
										year: "2-digit",
										month: "numeric",
										day: "numeric",
									},
								) ?? null;

							const formattedFailedDate =
								getLocalDayFromUTCDate(failure.failedDate)?.toLocaleDateString(
									undefined,
									{
										year: "2-digit",
										month: "numeric",
										day: "numeric",
									},
								) ?? "Unknown Date";

							const dateString = formattedUpdatedDate
								? `As of ${formattedUpdatedDate} (first noted ${formattedFailedDate}).`
								: `First noted ${formattedFailedDate}.`;

							return (
								<Alert key={failure.reason} variant="destructive">
									<Clock />
									<AlertTitle>{reasonText}</AlertTitle>
									<AlertDescription>{dateString}</AlertDescription>
								</Alert>
							);
						}
						return null;
					})}

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
