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
								{!readOnly && <TableHead className="w-2.5"></TableHead>}
								<TableHead className="hidden w-20 sm:table-cell">
									Date
								</TableHead>
								<TableHead className="hidden w-20 sm:table-cell">
									Type
								</TableHead>
								<TableHead className="w-20">Link</TableHead>
								<TableHead className="w-20">Reminded</TableHead>
								<TableHead className="w-20">Status</TableHead>
								<TableHead className="hidden w-20 sm:table-cell">
									As Of
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{isLoadingQuestionnaires && (
								<TableRow>
									<TableCell className="text-center" colSpan={6}>
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
										<TableCell className="hidden sm:table-cell">
											{questionnaire.questionnaireType}
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
										<TableCell className="table-cell sm:hidden">
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
												"N/A"
											)}
										</TableCell>
										<TableCell
											className={getReminderColorClass(questionnaire.reminded)}
										>
											{questionnaire.reminded}
										</TableCell>
										<TableCell
											className={cn(
												"table-cell sm:hidden",
												getStatusColorClass(questionnaire.status),
											)}
										>
											{questionnaire?.status ? questionnaire.status[0] : "U"}
										</TableCell>
										<TableCell
											className={cn(
												"hidden sm:table-cell",
												getStatusColorClass(questionnaire.status),
											)}
										>
											{questionnaire.status}
										</TableCell>
										<TableCell className="hidden sm:table-cell">
											{getLocalDayFromUTCDate(
												questionnaire.updatedAt,
											)?.toLocaleDateString(undefined, {
												year: "2-digit",
												month: "numeric",
												day: "numeric",
											}) ?? "N/A"}
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
