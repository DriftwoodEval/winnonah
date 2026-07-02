"use client";

import { Button } from "@ui/button";
import Link from "next/link";
import { useCheckPermission } from "~/hooks/use-check-permission";
import type { ClientWithIssueInfo } from "~/lib/models";
import type { PermissionId } from "~/lib/types";
import { api } from "~/trpc/react";
import {
	ClientsSharingQuestionnaires,
	DuplicateDriveFoldersList,
	DuplicateNamesList,
	IssueList,
	IssueListSkeleton,
	SuggestionIssueList,
} from "../issues/issuesList";
import { MyDayWidget, WhosInWidget } from "./DayAheadWidgets";

function Shell({ children }: { children: React.ReactNode }) {
	return <div className="flex w-full flex-col">{children}</div>;
}

function SimpleIssueWidget({
	permission,
	isLoading,
	clients,
	title,
	description,
}: {
	permission: PermissionId;
	isLoading: boolean;
	clients: ClientWithIssueInfo[] | undefined;
	title: string;
	description: string;
}) {
	const can = useCheckPermission();
	if (!can(permission)) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	return (
		<Shell>
			<IssueList
				clients={clients ?? []}
				description={description}
				fill
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
		case "babynet-er":
			return <BabyNetERWidget />;
		case "notes-only":
			return can("clients:merge") ? <NotesOnlyWidget /> : null;
		case "no-drive-ids":
			return <NoDriveIdsWidget />;
		case "private-pay":
			return <PrivatePayWidget />;
		case "missing-records-needed":
			return <MissingRecordsNeededWidget />;
		case "unreviewed-records":
			return <UnreviewedRecordsWidget />;
		case "duplicate-drive":
			return <DuplicateDriveWidget />;
		case "duplicate-q-links":
			return <DuplicateQLinkWidget />;
		case "clients-sharing-q":
			return <ClientsSharingQWidget />;
		case "duplicate-names":
			return <DuplicateNamesWidget />;
		default:
			return null;
	}
}

function DD4Widget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getDD4.useQuery(undefined, {
		enabled: can("issues:dd4"),
	});
	return (
		<SimpleIssueWidget
			clients={data}
			description="Clients located in Dorchester District 4."
			isLoading={isLoading}
			permission="issues:dd4"
			title="In DD4"
		/>
	);
}

function JustAddedWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.questionnaires.getJustAdded.useQuery(
		undefined,
		{ enabled: can("issues:just-added") },
	);
	return (
		<SimpleIssueWidget
			clients={data}
			description="Questionnaires generated but not sent to client."
			isLoading={isLoading}
			permission="issues:just-added"
			title="Just Added Questionnaires"
		/>
	);
}

function PausedClientsWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getPaused.useQuery(undefined, {
		enabled: can("issues:paused-clients"),
	});
	return (
		<SimpleIssueWidget
			clients={data}
			description="Manually paused clients for review."
			isLoading={isLoading}
			permission="issues:paused-clients"
			title="Paused Clients"
		/>
	);
}

function EvaluationInProcessWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getEvaluationInProcess.useQuery(
		undefined,
		{ enabled: can("issues:evaluation-in-process") },
	);
	return (
		<SimpleIssueWidget
			clients={data}
			description="Clients with an evaluation currently in process."
			isLoading={isLoading}
			permission="issues:evaluation-in-process"
			title="Evaluation In Process"
		/>
	);
}

function MissingAppointmentsWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getMissingAppointments.useQuery(
		undefined,
		{ enabled: can("issues:missing-appointments") },
	);
	return (
		<SimpleIssueWidget
			clients={data}
			description="Clients with fewer scheduled appointments than the insurance calculation requires."
			isLoading={isLoading}
			permission="issues:missing-appointments"
			title="Appointments to be Created"
		/>
	);
}

function AutismStopsWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getAutismStops.useQuery(undefined, {
		enabled: can("issues:autism-stops"),
	});
	return (
		<SimpleIssueWidget
			clients={data}
			description='"Autism" found in school records, should be discharged.'
			isLoading={isLoading}
			permission="issues:autism-stops"
			title="Autism Stops"
		/>
	);
}

function ClientsNotInDbWidget() {
	const can = useCheckPermission();
	const utils = api.useUtils();
	const { data, isLoading } = api.google.verifyPunchClients.useQuery(
		undefined,
		{ enabled: can("issues:clients-not-in-db") },
	);
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
					updatePunchId({ currentId: itemId, newId: suggestedId })
				}
				title="Punchlist Clients Not In DB"
			/>
		</Shell>
	);
}

function PunchlistInactiveWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.google.verifyPunchClients.useQuery(
		undefined,
		{ enabled: can("issues:punchlist-inactive") },
	);
	return (
		<SimpleIssueWidget
			clients={data?.inactiveClients}
			description="Inactive clients currently on the punchlist."
			isLoading={isLoading}
			permission="issues:punchlist-inactive"
			title="Punchlist Clients Inactive"
		/>
	);
}

function PunchlistDuplicatesWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.google.verifyPunchClients.useQuery(
		undefined,
		{ enabled: can("issues:punchlist-duplicates") },
	);
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
			isLoading={isLoading}
			permission="issues:punchlist-duplicates"
			title="Duplicate Punchlist IDs"
		/>
	);
}

function NoReferralSourceWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getNoReferralSource.useQuery(
		undefined,
		{ enabled: can("issues:no-referral-source") },
	);
	return (
		<SimpleIssueWidget
			clients={data}
			description="Active clients with no referral source."
			isLoading={isLoading}
			permission="issues:no-referral-source"
			title="No Referral Source"
		/>
	);
}

function MissingDistrictsWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getDistrictErrors.useQuery(
		undefined,
		{ enabled: can("issues:district-issues") },
	);
	return (
		<SimpleIssueWidget
			clients={data?.clientsWithoutDistrict}
			description="Clients missing a school district."
			isLoading={isLoading}
			permission="issues:district-issues"
			title="Missing Districts"
		/>
	);
}

function PoorAddressLookupWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getDistrictErrors.useQuery(
		undefined,
		{ enabled: can("issues:district-issues") },
	);
	return (
		<SimpleIssueWidget
			clients={data?.clientsWithPoorAddressLookup}
			description="Address info was only found after cutting, should be double checked."
			isLoading={isLoading}
			permission="issues:district-issues"
			title="Poor Address Lookup"
		/>
	);
}

function BabyNetAgeoutWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getBabyNetErrors.useQuery(undefined, {
		enabled: can("issues:babynet-ageout"),
	});
	return (
		<SimpleIssueWidget
			clients={data}
			description="Clients who have aged out of BabyNet eligibility, but still have it listed."
			isLoading={isLoading}
			permission="issues:babynet-ageout"
			title="Too Old for BabyNet"
		/>
	);
}

function NotInTAWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getNotInTAErrors.useQuery(undefined, {
		enabled: can("issues:not-in-ta"),
	});
	return (
		<SimpleIssueWidget
			clients={data}
			description='Clients who were not imported from TA and were not added using the "Shell Client"/"Notes Only" feature.'
			isLoading={isLoading}
			permission="issues:not-in-ta"
			title="Not in TA"
		/>
	);
}

function DropListWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getDropList.useQuery(undefined, {
		enabled: can("issues:droplist"),
	});
	return (
		<SimpleIssueWidget
			clients={data}
			description="Clients who have been reminded more than 3 times and aren't completing tasks."
			isLoading={isLoading}
			permission="issues:droplist"
			title="Drop List"
		/>
	);
}

function BabyNetERWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getNeedsBabyNetERDownloaded.useQuery(
		undefined,
		{ enabled: can("issues:babynet-er") },
	);
	return (
		<SimpleIssueWidget
			clients={data}
			description="BabyNet Evaluation Report marked needed but not downloaded."
			isLoading={isLoading}
			permission="issues:babynet-er"
			title="Needs BabyNet ER Downloaded"
		/>
	);
}

function NotesOnlyWidget() {
	const { data: noteOnlyClients, isLoading: isLoadingNoteOnly } =
		api.clients.getNoteOnlyClients.useQuery();
	const { data: mergeSuggestions, isLoading: isLoadingMerge } =
		api.clients.getMergeSuggestions.useQuery();

	if (isLoadingNoteOnly || isLoadingMerge)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	const clients = noteOnlyClients ?? [];
	const sorted = [...clients].sort((a, b) => {
		const aHas = mergeSuggestions?.some((s) => s.noteOnlyClient.id === a.id);
		const bHas = mergeSuggestions?.some((s) => s.noteOnlyClient.id === b.id);
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
				description='"Shell" clients created, should be merged with "Real" client from TA when possible.'
				fill
				items={sorted.map((client) => ({
					id: client.id.toString(),
					name: client.fullName,
					hash: client.hash,
					originalData: client,
					suggestions:
						mergeSuggestions?.find((s) => s.noteOnlyClient.id === client.id)
							?.suggestedRealClients ?? [],
				}))}
				title="Notes Only"
			/>
		</Shell>
	);
}

function NoDriveIdsWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getNoDriveIdErrors.useQuery(
		undefined,
		{ enabled: can("issues:no-drive-ids") },
	);
	return (
		<SimpleIssueWidget
			clients={data}
			description="Clients missing a Google Drive folder ID."
			isLoading={isLoading}
			permission="issues:no-drive-ids"
			title="No Drive IDs"
		/>
	);
}

function PrivatePayWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getPossiblePrivatePay.useQuery(
		undefined,
		{ enabled: can("issues:private-pay") },
	);
	return (
		<SimpleIssueWidget
			clients={data}
			description="Clients with no eligible evaluators based on insurance and district/zip code."
			isLoading={isLoading}
			permission="issues:private-pay"
			title="Potential Private Pay"
		/>
	);
}

function MissingRecordsNeededWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getMissingRecordsNeeded.useQuery(
		undefined,
		{ enabled: can("issues:missing-records-needed") },
	);
	return (
		<SimpleIssueWidget
			clients={data}
			description="Clients whose records needed status is not set."
			isLoading={isLoading}
			permission="issues:missing-records-needed"
			title="Records Needed Not Set"
		/>
	);
}

function UnreviewedRecordsWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getUnreviewedRecords.useQuery(
		undefined,
		{ enabled: can("issues:unreviewed-records") },
	);
	return (
		<SimpleIssueWidget
			clients={data}
			description="Records needed and requested more than 3 weekdays ago, but not reviewed."
			isLoading={isLoading}
			permission="issues:unreviewed-records"
			title="Unreviewed/Unreceived Records"
		/>
	);
}

function DuplicateDriveWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.google.findDuplicates.useQuery(undefined, {
		enabled: can("issues:duplicate-drive"),
	});
	if (!can("issues:duplicate-drive")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
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
	const { data, isLoading } = api.questionnaires.getDuplicateLinks.useQuery(
		undefined,
		{ enabled: can("issues:duplicate-questionnaires") },
	);
	const clients =
		data?.duplicatePerClient
			.map((item) => item.client)
			.filter((c): c is NonNullable<typeof c> => c !== undefined)
			.filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i) ?? [];
	return (
		<SimpleIssueWidget
			clients={clients}
			description="Clients who have the same questionnaire link multiple times."
			isLoading={isLoading}
			permission="issues:duplicate-questionnaires"
			title="Clients with Duplicate Questionnaire Links"
		/>
	);
}

function ClientsSharingQWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.questionnaires.getDuplicateLinks.useQuery(
		undefined,
		{ enabled: can("issues:duplicate-questionnaires") },
	);
	if (!can("issues:duplicate-questionnaires")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
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
	const { data, isLoading } = api.clients.getDuplicateNames.useQuery(
		undefined,
		{ enabled: can("issues:duplicate-names") },
	);
	if (!can("issues:duplicate-names")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	return (
		<Shell>
			<DuplicateNamesList fill groups={data ?? []} />
		</Shell>
	);
}
