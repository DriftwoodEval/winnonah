"use client";

import { Button } from "@ui/button";
import Link from "next/link";
import { useCheckPermission } from "~/hooks/use-check-permission";
import type { ClientWithIssueInfo } from "~/lib/models";
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
	if (!can("issues:dd4")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (!data?.length) return null;
	return (
		<Shell>
			<IssueList
				clients={data}
				description="Clients located in Dorchester District 4."
				fill
				title="In DD4"
			/>
		</Shell>
	);
}

function JustAddedWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.questionnaires.getJustAdded.useQuery(
		undefined,
		{ enabled: can("issues:just-added") },
	);
	if (!can("issues:just-added")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (!data?.length) return null;
	return (
		<Shell>
			<IssueList
				clients={data}
				description="Questionnaires generated but not sent to client."
				fill
				title="Just Added Questionnaires"
			/>
		</Shell>
	);
}

function PausedClientsWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getPaused.useQuery(undefined, {
		enabled: can("issues:paused-clients"),
	});
	if (!can("issues:paused-clients")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (!data?.length) return null;
	return (
		<Shell>
			<IssueList
				clients={data}
				description="Manually paused clients for review."
				fill
				title="Paused Clients"
			/>
		</Shell>
	);
}

function EvaluationInProcessWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getEvaluationInProcess.useQuery(
		undefined,
		{ enabled: can("issues:evaluation-in-process") },
	);
	if (!can("issues:evaluation-in-process")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (!data?.length) return null;
	return (
		<Shell>
			<IssueList
				clients={data}
				description="Clients with an evaluation currently in process."
				fill
				title="Evaluation In Process"
			/>
		</Shell>
	);
}

function MissingAppointmentsWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getMissingAppointments.useQuery(
		undefined,
		{ enabled: can("issues:missing-appointments") },
	);
	if (!can("issues:missing-appointments")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (!data?.length) return null;
	return (
		<Shell>
			<IssueList
				clients={data}
				description="Clients with fewer scheduled appointments than the insurance calculation requires."
				fill
				title="Appointments to be Created"
			/>
		</Shell>
	);
}

function AutismStopsWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getAutismStops.useQuery(undefined, {
		enabled: can("issues:autism-stops"),
	});
	if (!can("issues:autism-stops")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (!data?.length) return null;
	return (
		<Shell>
			<IssueList
				clients={data}
				description='"Autism" found in school records, should be discharged.'
				fill
				title="Autism Stops"
			/>
		</Shell>
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
	if (!data?.clientsNotInDb.length) return null;
	return (
		<Shell>
			<SuggestionIssueList
				actionButtonText="Update Punch ID"
				description="Clients on the punchlist but not in the database, likely incorrect IDs."
				fill
				isActioning={isPending}
				items={data.clientsNotInDb.map((c) => ({
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
	if (!can("issues:punchlist-inactive")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (!data?.inactiveClients.length) return null;
	return (
		<Shell>
			<IssueList
				clients={data.inactiveClients}
				description="Inactive clients currently on the punchlist."
				fill
				title="Punchlist Clients Inactive"
			/>
		</Shell>
	);
}

function PunchlistDuplicatesWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.google.verifyPunchClients.useQuery(
		undefined,
		{ enabled: can("issues:punchlist-duplicates") },
	);
	if (!can("issues:punchlist-duplicates")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
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
	if (!dupes.length) return null;
	return (
		<Shell>
			<IssueList
				clients={dupes}
				description="Duplicate client IDs found on the punchlist."
				fill
				title="Duplicate Punchlist IDs"
			/>
		</Shell>
	);
}

function NoReferralSourceWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getNoReferralSource.useQuery(
		undefined,
		{ enabled: can("issues:no-referral-source") },
	);
	if (!can("issues:no-referral-source")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (!data?.length) return null;
	return (
		<Shell>
			<IssueList
				clients={data}
				description="Active clients with no referral source."
				fill
				title="No Referral Source"
			/>
		</Shell>
	);
}

function MissingDistrictsWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getDistrictErrors.useQuery(
		undefined,
		{ enabled: can("issues:district-issues") },
	);
	if (!can("issues:district-issues")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (!data?.clientsWithoutDistrict.length) return null;
	return (
		<Shell>
			<IssueList
				clients={data.clientsWithoutDistrict}
				description="Clients missing a school district."
				fill
				title="Missing Districts"
			/>
		</Shell>
	);
}

function PoorAddressLookupWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getDistrictErrors.useQuery(
		undefined,
		{ enabled: can("issues:district-issues") },
	);
	if (!can("issues:district-issues")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (!data?.clientsWithPoorAddressLookup.length) return null;
	return (
		<Shell>
			<IssueList
				clients={data.clientsWithPoorAddressLookup}
				description="Address info was only found after cutting, should be double checked."
				fill
				title="Poor Address Lookup"
			/>
		</Shell>
	);
}

function BabyNetAgeoutWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getBabyNetErrors.useQuery(undefined, {
		enabled: can("issues:babynet-ageout"),
	});
	if (!can("issues:babynet-ageout")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (!data?.length) return null;
	return (
		<Shell>
			<IssueList
				clients={data}
				description="Clients who have aged out of BabyNet eligibility, but still have it listed."
				fill
				title="Too Old for BabyNet"
			/>
		</Shell>
	);
}

function NotInTAWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getNotInTAErrors.useQuery(undefined, {
		enabled: can("issues:not-in-ta"),
	});
	if (!can("issues:not-in-ta")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (!data?.length) return null;
	return (
		<Shell>
			<IssueList
				clients={data}
				description='Clients who were not imported from TA and were not added using the "Shell Client"/"Notes Only" feature.'
				fill
				title="Not in TA"
			/>
		</Shell>
	);
}

function DropListWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getDropList.useQuery(undefined, {
		enabled: can("issues:droplist"),
	});
	if (!can("issues:droplist")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (!data?.length) return null;
	return (
		<Shell>
			<IssueList
				clients={data}
				description="Clients who have been reminded more than 3 times and aren't completing tasks."
				fill
				title="Drop List"
			/>
		</Shell>
	);
}

function BabyNetERWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getNeedsBabyNetERDownloaded.useQuery(
		undefined,
		{
			enabled: can("issues:babynet-er"),
		},
	);
	if (!can("issues:babynet-er")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (!data?.length) return null;
	return (
		<Shell>
			<IssueList
				clients={data}
				description="BabyNet Evaluation Report marked needed but not downloaded."
				fill
				title="Needs BabyNet ER Downloaded"
			/>
		</Shell>
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
	if (!noteOnlyClients?.length) return null;

	const sorted = [...noteOnlyClients].sort((a, b) => {
		const aHas = mergeSuggestions?.some((s) => s.noteOnlyClient.id === a.id);
		const bHas = mergeSuggestions?.some((s) => s.noteOnlyClient.id === b.id);
		if (aHas && !bHas) return -1;
		if (!aHas && bHas) return 1;
		return noteOnlyClients.indexOf(a) - noteOnlyClients.indexOf(b);
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
	if (!can("issues:no-drive-ids")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (!data?.length) return null;
	return (
		<Shell>
			<IssueList
				clients={data}
				description="Clients missing a Google Drive folder ID."
				fill
				title="No Drive IDs"
			/>
		</Shell>
	);
}

function PrivatePayWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getPossiblePrivatePay.useQuery(
		undefined,
		{ enabled: can("issues:private-pay") },
	);
	if (!can("issues:private-pay")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (!data?.length) return null;
	return (
		<Shell>
			<IssueList
				clients={data}
				description="Clients with no eligible evaluators based on insurance and district/zip code."
				fill
				title="Potential Private Pay"
			/>
		</Shell>
	);
}

function MissingRecordsNeededWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getMissingRecordsNeeded.useQuery(
		undefined,
		{ enabled: can("issues:missing-records-needed") },
	);
	if (!can("issues:missing-records-needed")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (!data?.length) return null;
	return (
		<Shell>
			<IssueList
				clients={data}
				description="Clients whose records needed status is not set."
				fill
				title="Records Needed Not Set"
			/>
		</Shell>
	);
}

function UnreviewedRecordsWidget() {
	const can = useCheckPermission();
	const { data, isLoading } = api.clients.getUnreviewedRecords.useQuery(
		undefined,
		{ enabled: can("issues:unreviewed-records") },
	);
	if (!can("issues:unreviewed-records")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	if (!data?.length) return null;
	return (
		<Shell>
			<IssueList
				clients={data}
				description="Records needed and requested more than 3 weekdays ago, but not reviewed."
				fill
				title="Unreviewed/Unreceived Records"
			/>
		</Shell>
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
	if (!data?.data.length) return null;
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
	if (!can("issues:duplicate-questionnaires")) return null;
	if (isLoading)
		return (
			<Shell>
				<IssueListSkeleton />
			</Shell>
		);
	const clients =
		data?.duplicatePerClient
			.map((item) => item.client)
			.filter((c): c is NonNullable<typeof c> => c !== undefined)
			.filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i) ?? [];
	if (!clients.length) return null;
	return (
		<Shell>
			<IssueList
				clients={clients}
				description="Clients who have the same questionnaire link multiple times."
				fill
				title="Clients with Duplicate Questionnaire Links"
			/>
		</Shell>
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
	if (!data?.sharedAcrossClients.length) return null;
	return (
		<Shell>
			<ClientsSharingQuestionnaires
				fill
				sharedLinksData={data.sharedAcrossClients}
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
	if (!data?.length) return null;
	return (
		<Shell>
			<DuplicateNamesList fill groups={data} />
		</Shell>
	);
}
