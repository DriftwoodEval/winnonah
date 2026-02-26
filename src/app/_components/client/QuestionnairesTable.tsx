"use client";

import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { Info } from "lucide-react";
import Link from "next/link";
import {
	cn,
	getLocalDayFromUTCDate,
	getReminderColorClass,
	getStatusColorClass,
} from "~/lib/utils";
import { api } from "~/trpc/react";
import { AddQuestionnaireButton } from "./AddQuestionnaireButton";
import { ProtocolsScannedCheckbox } from "./ProtocolsScannedCheckbox";
import { QuestionnaireActionsMenu } from "./QuestionnaireTableActionsMenu";
import { ScreenshotButton } from "./ScreenshotButton";

interface QuestionnairesTableProps {
	clientId: number | undefined;
	readOnly?: boolean;
}

export function QuestionnairesTable({
	clientId,
	readOnly,
}: QuestionnairesTableProps) {
	const { data: questionnairesSent, isLoading: isLoadingQuestionnaires } =
		api.questionnaires.getSentQuestionnaires.useQuery(clientId ?? 0, {
			enabled: typeof clientId === "number" && clientId > 0,
		});

	const hasJustAdded = questionnairesSent?.some(
		(q) => q.status === "JUST_ADDED",
	);

	const truncateLink = (link: string | null, maxLength: number = 25) => {
		if (!link) return "";

		let truncated = link.replace(/^https?:\/\/(www\.)?/, "");

		if (truncated.length > maxLength) {
			truncated = `${truncated.slice(0, maxLength - 3)}...`;
		}

		return truncated;
	};

	return (
		<div className="flex w-full flex-col gap-4">
			{hasJustAdded && (
				<Alert variant="destructive">
					<Info className="h-4 w-4" />
					<AlertTitle>"JUST_ADDED" Questionnaires</AlertTitle>
					<AlertDescription>
						"JUST_ADDED" questionnaires have NOT been sent to the client and
						will not be checked for completion or included in reminders. Send
						them to the client and set them to "Pending".
					</AlertDescription>
				</Alert>
			)}
			<div className="w-full rounded-md border shadow">
				<div className="sticky top-0 z-10 flex items-center justify-between gap-2 p-4">
					<div className="flex items-center gap-4">
						<h4 className="font-bold leading-none">Questionnaires</h4>
						{clientId && (
							<ProtocolsScannedCheckbox
								clientId={clientId}
								readOnly={readOnly}
							/>
						)}
					</div>

					{!readOnly && <AddQuestionnaireButton clientId={clientId} />}
				</div>
				<div className="px-4 pb-4">
					<Table className="text-xs">
						<TableHeader>
							<TableRow>
								{!readOnly && <TableHead className="w-10"></TableHead>}
								<TableHead className="hidden w-20 sm:table-cell">
									Date
								</TableHead>
								<TableHead className="w-24">Type</TableHead>
								<TableHead className="hidden w-32 sm:table-cell">
									Link
								</TableHead>
								<TableHead className="hidden w-16 sm:table-cell">
									Reminded
								</TableHead>
								<TableHead className="w-12 sm:w-20">Status</TableHead>
								<TableHead className="w-20">As Of</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{isLoadingQuestionnaires && (
								<TableRow>
									<TableCell className="text-center" colSpan={7}>
										Loading...
									</TableCell>
								</TableRow>
							)}
							{questionnairesSent
								?.filter((questionaire) => questionaire.status !== "ARCHIVED")
								.map((questionnaire) => (
									<TableRow key={questionnaire.id}>
										{!readOnly && (
											<TableCell>
												<QuestionnaireActionsMenu
													questionnaire={questionnaire}
												/>
											</TableCell>
										)}
										<TableCell className="hidden sm:table-cell">
											{getLocalDayFromUTCDate(
												questionnaire.sent,
											)?.toLocaleDateString(undefined, {
												year: "2-digit",
												month: "numeric",
												day: "numeric",
											}) ?? "N/A"}
										</TableCell>
										<TableCell className="w-24 font-medium">
											{questionnaire.link ? (
												<Link
													className="text-primary hover:underline"
													href={questionnaire.link}
													rel="noopener noreferrer"
													target="_blank"
												>
													{questionnaire.questionnaireType}
												</Link>
											) : (
												questionnaire.questionnaireType
											)}
										</TableCell>
										<TableCell className="hidden sm:table-cell">
											{questionnaire.link ? (
												<Link
													className="text-primary hover:underline"
													href={questionnaire.link}
													rel="noopener noreferrer"
													target="_blank"
												>
													{truncateLink(questionnaire.link)}
												</Link>
											) : (
												"N/A"
											)}
										</TableCell>
										<TableCell
											className={cn(
												"hidden sm:table-cell",
												getReminderColorClass(questionnaire.reminded),
											)}
										>
											{questionnaire.reminded}
										</TableCell>
										<TableCell
											className={cn(
												"w-12 sm:w-20",
												getStatusColorClass(questionnaire.status),
											)}
										>
											<span className="sm:hidden">
												{questionnaire.status ? questionnaire.status[0] : "U"}
											</span>
											<span className="hidden sm:inline">
												{questionnaire.status}
											</span>
										</TableCell>
										<TableCell className="w-20">
											{questionnaire.link ? (
												<ScreenshotButton
													className="w-full cursor-pointer text-left hover:underline"
													link={questionnaire.link}
												>
													{getLocalDayFromUTCDate(
														questionnaire.updatedAt,
													)?.toLocaleDateString(undefined, {
														year: "2-digit",
														month: "numeric",
														day: "numeric",
													}) ?? "N/A"}
												</ScreenshotButton>
											) : (
												(getLocalDayFromUTCDate(
													questionnaire.updatedAt,
												)?.toLocaleDateString(undefined, {
													year: "2-digit",
													month: "numeric",
													day: "numeric",
												}) ?? "N/A")
											)}
										</TableCell>
									</TableRow>
								))}
						</TableBody>
					</Table>
				</div>
			</div>
		</div>
	);
}
