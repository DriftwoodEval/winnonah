"use client";

import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import { Skeleton } from "@ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Clock, FileText, MapPinOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ClientColor } from "~/lib/colors";
import { logger } from "~/lib/logger";
import { formatClientAge, getLocalDayFromUTCDate } from "~/lib/utils";
import { api } from "~/trpc/react";
import { BabyNetBoxes } from "./BabyNetBoxes";
import { ClientDetailsCard } from "./ClientDetailsCard";
import { ClientHeader } from "./ClientHeader";
import { ClientNoteEditor } from "./ClientNoteEditor";
import { CommunicationTimeline } from "./CommunicationTimeline";
import { EligibleEvaluatorsList } from "./EligibleEvaluatorsList";
import { PersistentStatusAlert } from "./PersistentStatusAlert";
import { QuestionnairesTable } from "./QuestionnairesTable";
import { RecordsNoteEditor } from "./RecordsNoteEditor";
import { RelatedClients } from "./RelatedClients";

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
		<div className="relative flex w-full flex-col items-center lg:flex-row lg:items-start lg:justify-center lg:gap-8 lg:px-6">
			{/* Spacer to balance the sticky sidebar on the right and keep main content centered */}
			<div className="hidden shrink-0 lg:block lg:w-[230px]" />

			<div className="flex w-full max-w-[calc(100%-32px)] flex-col items-center gap-6 lg:max-w-3xl">
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
					<>
						<PersistentStatusAlert
							condition={!!client.autismStop}
							description="Records suggest this client has already been identified. If this is incorrect, please let Andrew know."
							icon={FileText}
							identifier={client.hash}
							slug="autism-stop"
							title='"Autism" in Records'
						/>

						<PersistentStatusAlert
							condition={
								client.schoolDistrict === "Dorchester School District 4"
							}
							description="This client's address is in DD4. If this is incorrect, please edit the client's district."
							icon={MapPinOff}
							identifier={client.hash}
							slug="dd4"
							title="Dorchester District 4"
						/>

						<Tabs className="w-full" defaultValue="info">
							{client.id.toString().length !== 5 && (
								<TabsList className="w-full">
									<TabsTrigger value="info">Info</TabsTrigger>
									<TabsTrigger value="records">Records</TabsTrigger>
								</TabsList>
							)}

							<TabsContent value="info">
								<div className="mb-6 flex w-full flex-col items-center gap-6">
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
												getLocalDayFromUTCDate(
													failure.updatedAt,
												)?.toLocaleDateString(undefined, {
													year: "2-digit",
													month: "numeric",
													day: "numeric",
												}) ?? null;

											const formattedFailedDate =
												getLocalDayFromUTCDate(
													failure.failedDate,
												)?.toLocaleDateString(undefined, {
													year: "2-digit",
													month: "numeric",
													day: "numeric",
												}) ?? "Unknown Date";

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
										<QuestionnairesTable
											clientId={client.id}
											readOnly={readOnly}
										/>
									)}

									{client.id.toString().length !== 5 && (
										<EligibleEvaluatorsList client={client} />
									)}
								</div>
							</TabsContent>
							{client.id.toString().length !== 5 && (
								<TabsContent value="records">
									<div className="mb-6 flex w-full flex-col items-center gap-6">
										<ClientDetailsCard client={client} truncated />

										{Number(formatClientAge(client.dob, "years")) < 4 && (
											<BabyNetBoxes clientId={client.id} readOnly={readOnly} />
										)}

										<RecordsNoteEditor
											clientId={client.id}
											readOnly={readOnly}
										/>
									</div>
								</TabsContent>
							)}
						</Tabs>
					</>
				)}
			</div>

			<div className="flex w-[calc(100%-32px)] shrink-0 flex-col gap-6 lg:sticky lg:top-14 lg:mt-0 lg:w-[230px]">
				{client && (
					<RelatedClients
						clientId={client.id}
						lastName={client.lastName}
						readOnly={readOnly}
						relatedConnections={client.relatedConnections}
					/>
				)}
				{client?.phoneNumber && (
					<CommunicationTimeline phoneNumber={client.phoneNumber} />
				)}
			</div>
		</div>
	);
}
