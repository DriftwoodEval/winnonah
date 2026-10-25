"use client";

import {
	DDS_REQUESTS_DESCRIPTION,
	DdsRequestActions,
} from "@components/issues/DdsRequestActions";
import {
	ClientsSharingQuestionnaires,
	DuplicateDriveFoldersList,
	DuplicateNamesList,
	IssueList,
	IssueListSkeleton,
	SpecialAccommodationsActions,
	SuggestionIssueList,
} from "@components/issues/issuesList";
import { ErrorState } from "@components/shared/ErrorState";
import { Button } from "@ui/button";
import Link from "next/link";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { ISSUE_TITLES } from "~/lib/issues/issue-titles";
import type { ClientWithIssueInfo } from "~/lib/models";
import type { PermissionId } from "~/lib/types";
import { api } from "~/trpc/react";
import { MyDayWidget, WhosInWidget } from "./DayAheadWidgets";

function Shell({ children }: { children: React.ReactNode }) {
	return <div className="flex h-full w-full flex-col">{children}</div>;
}

function IssueWidgetError({ onRetry }: { onRetry: () => void }) {
	return (
		<Shell>
			<ErrorState compact onRetry={onRetry} />
		</Shell>
	);
}

function SimpleIssueWidget({
	permission,
	isLoading,
	isError,
	onRetry,
	clients,
	title,
	description,
	rowAction,
}: {
	permission: PermissionId;
	isLoading: boolean;
	isError: boolean;
	onRetry: () => void;
	clients: ClientWithIssueInfo[] | undefined;
	title: string;
	description: string;
	rowAction?: (client: ClientWithIssueInfo) => React.ReactNode;
}) {
	const can = useCheckPermission();
	if (!can(permission)) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (isError) return <IssueWidgetError onRetry={onRetry} />;
	return (
		<Shell>
			<IssueList
				clients={clients ?? []}
				description={description}
				fill
				rowAction={rowAction}
				title={title}
			/>
		</Shell>
	);
}

export function IssueWidgetById({ id }: { id: string }) {
	const can = useCheckPermission();

	switch (id) {
		case "day-ahead-mine":
			return <MyDayWidget />;
		case "day-ahead-offices":
			return <WhosInWidget />;
		case "dd4":
			return <DD4Widget />;
		case "just-added":
			return <JustAddedWidget />;
		case "paused-clients":
			return <PausedClientsWidget />;
		case "evaluation-in-process":
			return <EvaluationInProcessWidget />;
		case "missing-appointments":
			return <MissingAppointmentsWidget />;
		case "autism-stops":
			return <AutismStopsWidget />;
		case "clients-not-in-db":
			return <ClientsNotInDbWidget />;
		case "punchlist-inactive":
			return <PunchlistInactiveWidget />;
		case "punchlist-duplicates":
			return <PunchlistDuplicatesWidget />;
		case "no-referral-source":
			return <NoReferralSourceWidget />;
		case "missing-districts":
			return <MissingDistrictsWidget />;
		case "poor-address-lookup":
			return <PoorAddressLookupWidget />;
		case "babynet-ageout":
			return <BabyNetAgeoutWidget />;
		case "not-in-ta":
			return <NotInTAWidget />;
		case "droplist":
			return <DropListWidget />;
		case "notes-only":
			return can("clients:merge") ? <NotesOnlyWidget /> : null;
		case "no-drive-ids":
			return <NoDriveIdsWidget />;
		case "private-pay":
			return <PrivatePayWidget />;
		case "unreviewed-records":
			return <UnreviewedRecordsWidget />;
		case "charter-school-confirm":
			return <CharterSchoolConfirmWidget />;
		case "special-accommodations":
			return <SpecialAccommodationsWidget />;
		case "dds-requests":
			return <DdsRequestsWidget />;
		case "duplicate-drive":
			return <DuplicateDriveWidget />;
		case "duplicate-q-links":
			return <DuplicateQLinkWidget />;
		case "clients-sharing-q":
			return <ClientsSharingQWidget />;
		case "duplicate-names":
			return <DuplicateNamesWidget />;
		case "unreviewed-faxes":
			return <UnreviewedFaxesWidget />;
		default:
			return null;
	}
}

function DD4Widget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } = api.clients.getDD4.useQuery(
		undefined,
		{
			refetchInterval: 60_000,
			enabled: can("issues:dd4"),
		},
	);
	return (
		<SimpleIssueWidget
			clients={data}
			description="Clients located in Dorchester District 4."
			isError={isError}
			isLoading={isLoading}
			onRetry={refetch}
			permission="issues:dd4"
			title="In DD4"
		/>
	);
}

function JustAddedWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.questionnaires.getJustAdded.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:just-added"),
		});
	return (
		<SimpleIssueWidget
			clients={data}
			description="Questionnaires generated but not sent to client."
			isError={isError}
			isLoading={isLoading}
			onRetry={refetch}
			permission="issues:just-added"
			title="Just Added Questionnaires"
		/>
	);
}

function PausedClientsWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } = api.clients.getPaused.useQuery(
		undefined,
		{
			refetchInterval: 60_000,
			enabled: can("issues:paused-clients"),
		},
	);
	return (
		<SimpleIssueWidget
			clients={data}
			description="Manually paused clients for review."
			isError={isError}
			isLoading={isLoading}
			onRetry={refetch}
			permission="issues:paused-clients"
			title="Paused Clients"
		/>
	);
}

function EvaluationInProcessWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.clients.getEvaluationInProcess.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:evaluation-in-process"),
		});
	return (
		<SimpleIssueWidget
			clients={data}
			description="Clients with an evaluation currently in process."
			isError={isError}
			isLoading={isLoading}
			onRetry={refetch}
			permission="issues:evaluation-in-process"
			title="Evaluation In Process"
		/>
	);
}

function MissingAppointmentsWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.clients.getMissingAppointments.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:missing-appointments"),
		});
	return (
		<SimpleIssueWidget
			clients={data}
			description="Clients with fewer scheduled appointments than the insurance calculation requires."
			isError={isError}
			isLoading={isLoading}
			onRetry={refetch}
			permission="issues:missing-appointments"
			title="Appointments to be Created"
		/>
	);
}

function AutismStopsWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.clients.getAutismStops.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:autism-stops"),
		});
	return (
		<SimpleIssueWidget
			clients={data}
			description='"Autism" found in school records, should be discharged.'
			isError={isError}
			isLoading={isLoading}
			onRetry={refetch}
			permission="issues:autism-stops"
			title="Autism Stops"
		/>
	);
}

function ClientsNotInDbWidget() {
	const can = useCheckPermission();
	const utils = api.useUtils();
	const { data, isLoading, isError, refetch } =
		api.google.verifyPunchClients.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:clients-not-in-db"),
		});
	const { mutate: updatePunchId, isPending } =
		api.google.updatePunchId.useMutation({
			onSuccess: () => {
				utils.google.verifyPunchClients.invalidate();
			},
		});
	if (!can("issues:clients-not-in-db")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (isError) return <IssueWidgetError onRetry={refetch} />;
	return (
		<Shell>
			<SuggestionIssueList
				actionButtonText="Update Punch ID"
				description="Clients on the punchlist but not in the database, likely incorrect IDs."
				fill
				isActioning={isPending}
				items={(data?.clientsNotInDb ?? []).map((c) => ({
					id: c["Client ID"] ?? "",
					name: c["Client Name"] ?? "Unknown",
					suggestions: c.suggestions,
				}))}
				onAction={(itemId, suggestedId) =>
					updatePunchId({
						clientId: suggestedId,
						currentId: itemId,
						newId: suggestedId,
					})
				}
				title="Punchlist Clients Not In DB"
			/>
		</Shell>
	);
}

function PunchlistInactiveWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.google.verifyPunchClients.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:punchlist-inactive"),
		});
	return (
		<SimpleIssueWidget
			clients={data?.inactiveClients}
			description="Inactive clients currently on the punchlist."
			isError={isError}
			isLoading={isLoading}
			onRetry={refetch}
			permission="issues:punchlist-inactive"
			title="Punchlist Clients Inactive"
		/>
	);
}

function PunchlistDuplicatesWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.google.verifyPunchClients.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:punchlist-duplicates"),
		});
	const dupes =
		data?.duplicateIdClients.map(
			(c) =>
				({
					...c,
					fullName: c.fullName ?? c["Client Name"] ?? "Unknown",
					hash: c.hash ?? "",
					additionalInfo: `(ID: ${c["Client ID"]}, found ${
						(c as unknown as { duplicateCount: number }).duplicateCount
					} times)`,
				}) as ClientWithIssueInfo,
		) ?? [];
	return (
		<SimpleIssueWidget
			clients={dupes}
			description="Duplicate client IDs found on the punchlist."
			isError={isError}
			isLoading={isLoading}
			onRetry={refetch}
			permission="issues:punchlist-duplicates"
			title="Duplicate Punchlist IDs"
		/>
	);
}

function NoReferralSourceWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.clients.getNoReferralSource.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:no-referral-source"),
		});
	return (
		<SimpleIssueWidget
			clients={data}
			description="Active clients with no referral source."
			isError={isError}
			isLoading={isLoading}
			onRetry={refetch}
			permission="issues:no-referral-source"
			title="No Referral Source"
		/>
	);
}

function MissingDistrictsWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.clients.getDistrictErrors.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:district-issues"),
		});
	return (
		<SimpleIssueWidget
			clients={data?.clientsWithoutDistrict}
			description="Clients missing a school district."
			isError={isError}
			isLoading={isLoading}
			onRetry={refetch}
			permission="issues:district-issues"
			title="Missing Districts"
		/>
	);
}

function PoorAddressLookupWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.clients.getDistrictErrors.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:district-issues"),
		});
	return (
		<SimpleIssueWidget
			clients={data?.clientsWithPoorAddressLookup}
			description="Address info was only found after cutting, should be double checked."
			isError={isError}
			isLoading={isLoading}
			onRetry={refetch}
			permission="issues:district-issues"
			title="Poor Address Lookup"
		/>
	);
}

function BabyNetAgeoutWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.clients.getBabyNetErrors.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:babynet-ageout"),
		});
	return (
		<SimpleIssueWidget
			clients={data}
			description="Clients who have aged out of BabyNet eligibility, but still have it listed."
			isError={isError}
			isLoading={isLoading}
			onRetry={refetch}
			permission="issues:babynet-ageout"
			title="Too Old for BabyNet"
		/>
	);
}

function NotInTAWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.clients.getNotInTAErrors.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:not-in-ta"),
		});
	return (
		<SimpleIssueWidget
			clients={data}
			description="Clients who were not imported from TA and were not added using the Notes Only feature."
			isError={isError}
			isLoading={isLoading}
			onRetry={refetch}
			permission="issues:not-in-ta"
			title="Not in TA"
		/>
	);
}

function DropListWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.clients.getDropList.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:droplist"),
		});
	return (
		<SimpleIssueWidget
			clients={data}
			description="Clients who have been reminded more than 3 times and aren't completing tasks."
			isError={isError}
			isLoading={isLoading}
			onRetry={refetch}
			permission="issues:droplist"
			title="Drop List"
		/>
	);
}

function NotesOnlyWidget() {
	const {
		data: notesOnlyClients,
		isLoading: isLoadingNotesOnly,
		isError: notesOnlyFailed,
		refetch: refetchNotesOnly,
	} = api.clients.getNotesOnlyClients.useQuery(undefined, {
		refetchInterval: 60_000,
	});
	const { data: mergeSuggestions, isLoading: isLoadingMerge } =
		api.clients.getMergeSuggestions.useQuery(undefined, {
			refetchInterval: 60_000,
		});

	if (isLoadingNotesOnly || isLoadingMerge)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (notesOnlyFailed) return <IssueWidgetError onRetry={refetchNotesOnly} />;
	const clients = notesOnlyClients ?? [];
	const sorted = clients.toSorted((a, b) => {
		const aHas = mergeSuggestions?.some((s) => s.notesOnlyClient.id === a.id);
		const bHas = mergeSuggestions?.some((s) => s.notesOnlyClient.id === b.id);
		if (aHas && !bHas) return -1;
		if (!aHas && bHas) return 1;
		return clients.indexOf(a) - clients.indexOf(b);
	});

	return (
		<Shell>
			<SuggestionIssueList
				action={
					<Link href="/clients/merge">
						<Button className="cursor-pointer" size="sm" variant="outline">
							Merge Menu
						</Button>
					</Link>
				}
				description='Notes Only clients created, should be merged with "Real" client from TA when possible.'
				fill
				items={sorted.map((client) => ({
					id: client.id.toString(),
					name: client.fullName,
					hash: client.hash,
					originalData: client,
					suggestions:
						mergeSuggestions?.find((s) => s.notesOnlyClient.id === client.id)
							?.suggestedRealClients ?? [],
				}))}
				title="Notes Only"
			/>
		</Shell>
	);
}

function NoDriveIdsWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.clients.getNoDriveIdErrors.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:no-drive-ids"),
		});
	return (
		<SimpleIssueWidget
			clients={data}
			description="Clients missing a Google Drive folder ID."
			isError={isError}
			isLoading={isLoading}
			onRetry={refetch}
			permission="issues:no-drive-ids"
			title="No Drive IDs"
		/>
	);
}

function PrivatePayWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.clients.getPossiblePrivatePay.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:private-pay"),
		});
	return (
		<SimpleIssueWidget
			clients={data}
			description="Clients with no eligible evaluators based on insurance and district/zip code."
			isError={isError}
			isLoading={isLoading}
			onRetry={refetch}
			permission="issues:private-pay"
			title="Potential Private Pay"
		/>
	);
}

function UnreviewedRecordsWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.clients.getUnreviewedRecords.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:unreviewed-records"),
		});
	return (
		<SimpleIssueWidget
			clients={data}
			description="Records needed and requested more than 3 weekdays ago, but not reviewed."
			isError={isError}
			isLoading={isLoading}
			onRetry={refetch}
			permission="issues:unreviewed-records"
			title="Unreviewed/Unreceived Records"
		/>
	);
}

function CharterSchoolConfirmWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.clients.getUnconfirmedCharterSchool.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:charter-school-confirm"),
		});
	return (
		<SimpleIssueWidget
			clients={data}
			description="Intake says charter school. Records requests wait until someone confirms it on the Referral tab."
			isError={isError}
			isLoading={isLoading}
			onRetry={refetch}
			permission="issues:charter-school-confirm"
			title="Charter School Awaiting Confirmation"
		/>
	);
}

function SpecialAccommodationsWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.clients.getSpecialAccommodations.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:special-accommodations"),
		});
	return (
		<SimpleIssueWidget
			clients={data}
			description="Non-English Medicaid or BabyNet clients with a new appointment. Approve to email SCDHHS Special Accommodations so an interpreter can be arranged, or deny to skip it."
			isError={isError}
			isLoading={isLoading}
			onRetry={refetch}
			permission="issues:special-accommodations"
			rowAction={(client) => (
				<SpecialAccommodationsActions clientId={client.id} />
			)}
			title="Interpreter Notices to Approve"
		/>
	);
}

function DdsRequestsWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.clients.getDdsRequests.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:dds-requests"),
		});
	return (
		<SimpleIssueWidget
			clients={data}
			description={DDS_REQUESTS_DESCRIPTION}
			isError={isError}
			isLoading={isLoading}
			onRetry={refetch}
			permission="issues:dds-requests"
			rowAction={(client) => <DdsRequestActions client={client} />}
			title={ISSUE_TITLES.ddsRequests}
		/>
	);
}

function DuplicateDriveWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.google.findDuplicates.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:duplicate-drive"),
		});
	if (!can("issues:duplicate-drive")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (isError) return <IssueWidgetError onRetry={refetch} />;
	if (!data) return null;
	return (
		<Shell>
			<DuplicateDriveFoldersList
				duplicates={data.data}
				fill
				lastFetched={data.lastFetched}
			/>
		</Shell>
	);
}

function DuplicateQLinkWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.questionnaires.getDuplicateLinks.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:duplicate-questionnaires"),
		});
	const clients =
		data?.duplicatePerClient
			.map((item) => item.client)
			.filter((c): c is NonNullable<typeof c> => c !== undefined)
			.filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i) ?? [];
	return (
		<SimpleIssueWidget
			clients={clients}
			description="Clients who have the same questionnaire link multiple times."
			isError={isError}
			isLoading={isLoading}
			onRetry={refetch}
			permission="issues:duplicate-questionnaires"
			title="Clients with Duplicate Questionnaire Links"
		/>
	);
}

function ClientsSharingQWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.questionnaires.getDuplicateLinks.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:duplicate-questionnaires"),
		});
	if (!can("issues:duplicate-questionnaires")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (isError) return <IssueWidgetError onRetry={refetch} />;
	return (
		<Shell>
			<ClientsSharingQuestionnaires
				fill
				sharedLinksData={data?.sharedAcrossClients ?? []}
			/>
		</Shell>
	);
}

function DuplicateNamesWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.clients.getDuplicateNames.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("issues:duplicate-names"),
		});
	if (!can("issues:duplicate-names")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (isError) return <IssueWidgetError onRetry={refetch} />;
	return (
		<Shell>
			<DuplicateNamesList fill groups={data ?? []} />
		</Shell>
	);
}

function UnreviewedFaxesWidget() {
	const can = useCheckPermission();
	const { data, isLoading, isError, refetch } =
		api.faxCategorization.getPendingCount.useQuery(undefined, {
			refetchInterval: 60_000,
			enabled: can("fax:categorization:review"),
		});
	if (!can("fax:categorization:review")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (isError) return <IssueWidgetError onRetry={refetch} />;
	return (
		<Link
			className="flex h-full w-full flex-col items-center justify-center gap-1 p-3 hover:bg-accent hover:text-accent-foreground"
			href="/fax-categorization"
		>
			<span className="font-semibold text-3xl">{data ?? 0}</span>
			<span className="text-muted-foreground text-xs uppercase tracking-wide">
				Unreviewed Faxes
			</span>
		</Link>
	);
}
