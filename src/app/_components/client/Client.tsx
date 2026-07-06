"use client";

import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Skeleton } from "@ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { format } from "date-fns";
import {
	AlertTriangleIcon,
	Ban,
	Clock,
	FileText,
	MapPinOff,
	PauseCircle,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import type { ClientColor } from "~/lib/colors";
import { logger } from "~/lib/logger";
import {
	formatClientAge,
	getLocalDayFromUTCDate,
	isShellClientId,
} from "~/lib/utils";
import { api } from "~/trpc/react";
import { AdditionalInsuranceAppointmentsDisplay } from "./AdditionalInsuranceAppointmentsDisplay";
import { BabyNetBoxes } from "./BabyNetBoxes";
import { ClientAppointments } from "./ClientAppointments";
import { ClientDetailsCard } from "./ClientDetailsCard";
import { ClientHeader } from "./ClientHeader";
import { ClientNoteEditor } from "./ClientNoteEditor";
import { CommunicationTimeline } from "./CommunicationTimeline";
import { EligibleEvaluatorsList } from "./EligibleEvaluatorsList";
import { InPersonAssessmentsTable } from "./InPersonAssessmentsTable";
import { InsuranceTab } from "./InsuranceTab";
import { MergeRecommendationAlert } from "./MergeRecommendationAlert";
import { PersistentStatusAlert } from "./PersistentStatusAlert";
import { QuestionnairesTable } from "./QuestionnairesTable";
import { RecordsNoteEditor } from "./RecordsNoteEditor";
import { ReferralTab } from "./ReferralTab";
import { RelatedClients } from "./RelatedClients";

const log = logger.child({ module: "Client" });

export function Client({
	hash,
	readOnly,
}: {
	hash: string;
	readOnly?: boolean;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const can = useCheckPermission();

	const activeTab = searchParams.get("tab") ?? "info";

	const handleTabChange = (value: string) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set("tab", value);
		router.push(`${pathname}?${params.toString()}`);
	};

	const {
		data: client,
		isLoading: isLoadingClient,
		refetch: refetchClient,
	} = api.clients.getOne.useQuery({
		column: "hash",
		value: hash,
	});

	const isActive = isLoadingClient ? false : (client?.status ?? false);

	const [selectedColor, setSelectedColor] = useState<ClientColor | null>(null);

	const utils = api.useUtils();
	const trackClientViewMutation = api.users.trackClientView.useMutation({
		onSuccess: () => utils.users.getRecentClients.invalidate(),
	});

	const syncPunchDataMutation = api.clients.syncPunchData.useMutation({
		onSuccess: () => refetchClient(),
	});

	useEffect(() => {
		if (client?.color) {
			setSelectedColor(client.color);
		}
	}, [client?.color]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally fires only when the client identity (hash) changes
	useEffect(() => {
		if (client?.hash && client?.fullName) {
			trackClientViewMutation.mutate({
				hash: client.hash,
				name: client.fullName,
			});
			syncPunchDataMutation.mutate();
		}
	}, [client?.hash]);

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

	const updateRecordsNeededMutation = api.clients.update.useMutation({
		onSuccess: () => {
			refetchClient();
		},
		onError: (error) => {
			log.error(error, "Failed to update records needed");
			toast.error("Failed to update records needed", {
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
			{!readOnly && <div className="hidden shrink-0 lg:block lg:w-[230px]" />}

			<div className="flex w-full max-w-[calc(100%-32px)] flex-col items-center gap-6 lg:max-w-3xl">
				<ClientHeader
					client={client}
					isLoading={isLoading}
					onColorChange={handleColorChange}
					readOnly={readOnly}
					selectedColor={selectedColor}
				/>

				{isLoading || !client ? (
					<div className="flex w-full flex-col gap-6">
						<Skeleton className="h-9 w-full rounded-md" />
						<div className="flex w-full flex-wrap gap-6 rounded-md border-2 p-4 shadow-sm">
							{["dob", "age", "entry", "insurance", "district"].map((field) => (
								<div className="flex flex-col gap-1.5" key={field}>
									<Skeleton className="h-3.5 w-16" />
									<Skeleton className="h-4 w-24" />
								</div>
							))}
						</div>
						<div className="flex w-full flex-col gap-2">
							<Skeleton className="h-3.5 w-12" />
							<Skeleton className="h-9 w-full" />
							<Skeleton className="h-9 w-1/3" />
							<Skeleton className="h-32 w-full" />
						</div>
						<Skeleton className="h-48 w-full rounded-md" />
					</div>
				) : (
					<>
						<MergeRecommendationAlert client={client} readOnly={readOnly} />

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

						<Tabs
							className="w-full"
							onValueChange={handleTabChange}
							value={activeTab}
						>
							{(!isShellClientId(client.id) || can("clients:referral:tab")) && (
								<TabsList className="w-full">
									<TabsTrigger value="info">Info</TabsTrigger>
									{!isShellClientId(client.id) && (
										<TabsTrigger value="records">Records</TabsTrigger>
									)}
									{!isShellClientId(client.id) && (
										<TabsTrigger value="insurance">Insurance</TabsTrigger>
									)}
									{/* It's fine that this doesn't stop people from just visiting the URL, we aren't hiding this for security, we're hiding it so that we don't get people confused about it existing */}
									{can("clients:referral:tab") && (
										<TabsTrigger value="referral">Referral</TabsTrigger>
									)}
								</TabsList>
							)}

							<TabsContent value="info">
								<div className="mb-6 flex w-full flex-col items-center gap-6">
									{!isShellClientId(client.id) && (
										<ClientDetailsCard client={client} />
									)}

									{client.isOnDropList && isActive ? (
										<Alert variant="destructive">
											<Ban className="h-4 w-4" />
											<AlertTitle>
												On Drop List {(() => {
													const date = getLocalDayFromUTCDate(
														client.initialFailureDate,
													);
													return date ? (
														<span className="font-normal text-sm opacity-90">
															(Since {format(date, "MM/dd/yy")})
														</span>
													) : null;
												})()}
											</AlertTitle>
											<AlertDescription>
												{client.dropListReason}.
											</AlertDescription>
										</Alert>
									) : (
										clientFailures?.map((failure) => {
											if (
												(failure.reason === "docs not signed" ||
													failure.reason === "portal not opened") &&
												isActive
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
										})
									)}

									{client.pause && isActive && (
										<Alert variant="destructive">
											<PauseCircle className="h-4 w-4" />
											<AlertTitle>Client Paused</AlertTitle>
											<AlertDescription>
												This client has been manually paused for review.
											</AlertDescription>
										</Alert>
									)}

									{client.recordsNeeded === null &&
										isActive &&
										!isShellClientId(client.id) && (
											<Alert variant="destructive">
												<AlertTriangleIcon className="h-4 w-4" />
												<AlertTitle>Missing Records Needed Status</AlertTitle>
												<AlertDescription>
													Indicate whether school records are needed for this
													client in the Records tab. Questionnaires cannot be
													sent until then.
												</AlertDescription>
											</Alert>
										)}

									{!isShellClientId(client.id) && (
										<ClientAppointments clientId={client.id} />
									)}

									<ClientNoteEditor clientId={client.id} readOnly={readOnly} />

									{isShellClientId(client.id) && (
										<div className="flex w-full items-center justify-between rounded-md border p-3">
											<span className="font-medium text-sm">
												Records Needed
											</span>
											<Select
												disabled={readOnly || !can("clients:records:needed")}
												onValueChange={(value) => {
													updateRecordsNeededMutation.mutate({
														clientId: client.id,
														recordsNeeded: value as "Needed" | "Not Needed",
													});
												}}
												value={client.recordsNeeded ?? ""}
											>
												<SelectTrigger className="w-36">
													<SelectValue placeholder="Set status..." />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="Not Needed">Not Needed</SelectItem>
													<SelectItem value="Needed">Needed</SelectItem>
												</SelectContent>
											</Select>
										</div>
									)}

									{!isShellClientId(client.id) && (
										<QuestionnairesTable
											clientId={client.id}
											readOnly={readOnly}
										/>
									)}

									{!isShellClientId(client.id) && (
										<InPersonAssessmentsTable
											clientId={client.id}
											readOnly={readOnly}
										/>
									)}

									{!isShellClientId(client.id) && (
										<EligibleEvaluatorsList client={client} />
									)}
								</div>
							</TabsContent>
							{!isShellClientId(client.id) && (
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
							{!isShellClientId(client.id) && (
								<TabsContent value="insurance">
									<div className="mb-6 flex w-full flex-col gap-4">
										<ClientDetailsCard client={client} truncated />
										<InsuranceTab client={client} />
									</div>
								</TabsContent>
							)}
							<TabsContent value="referral">
								<div className="mb-6 flex min-w-full flex-col items-center gap-6">
									{!isShellClientId(client.id) && (
										<ClientDetailsCard client={client} truncated />
									)}
									<ReferralTab client={client} readOnly={readOnly} />
								</div>
							</TabsContent>
						</Tabs>
					</>
				)}
			</div>

			{!readOnly && (
				<div className="flex w-[calc(100%-32px)] shrink-0 flex-col gap-6 lg:sticky lg:top-14 lg:mt-0 lg:w-[230px]">
					{isLoading ? (
						<Skeleton className="h-48 w-full rounded-md" />
					) : (
						<>
							{client && (
								<RelatedClients
									clientId={client.id}
									lastName={client.lastName}
									phoneNumber={client.phoneNumber}
									readOnly={readOnly}
									relatedConnections={client.relatedConnections}
								/>
							)}
							{client && !isShellClientId(client.id) && (
								<AdditionalInsuranceAppointmentsDisplay client={client} />
							)}
							{client?.phoneNumber && (
								<CommunicationTimeline phoneNumber={client.phoneNumber} />
							)}
						</>
					)}
				</div>
			)}
		</div>
	);
}
