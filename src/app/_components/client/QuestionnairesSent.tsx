"use client";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import Link from "next/link";
import { cn, getReminderColorClass, getStatusColorClass } from "~/lib/utils";
import { api } from "~/trpc/react";
import { AddQuestionnaireButton } from "./AddQuestionnaireButton";
import { QuestionnaireActionsMenu } from "./QuestionnaireTableActionsMenu";

interface QuestionnairesSentProps {
	clientId: number | undefined;
	readOnly?: boolean;
}

export function QuestionnairesSent({
	clientId,
	readOnly,
}: QuestionnairesSentProps) {
	const { data: questionnairesSent, isLoading: isLoadingQuestionnaires } =
		api.questionnaires.getSentQuestionnaires.useQuery(clientId ?? 0, {
			enabled: typeof clientId === "number" && clientId > 0,
		});

	const truncateLink = (link: string | null, maxLength: number = 25) => {
		if (!link) return "";

		let truncated = link.replace(/^https?:\/\/(www\.)?/, "");

		if (truncated.length > maxLength) {
			truncated = `${truncated.slice(0, maxLength - 3)}...`;
		}

		return truncated;
	};

	return (
		<div className="w-full rounded-md border shadow">
			<div className="sticky top-0 z-10 flex items-center justify-between gap-2 p-4">
				<h4 className="font-bold leading-none sm:hidden">Questionnaires</h4>
				<h4 className="hidden font-bold leading-none sm:block">
					Questionnaires Sent
				</h4>
				{!readOnly && <AddQuestionnaireButton clientId={clientId} />}
			</div>
			<div className="px-4 pb-4">
				<Table className="text-xs">
					<TableHeader>
						<TableRow>
							{!readOnly && <TableHead className="w-2.5"></TableHead>}
							<TableHead className="hidden w-20 sm:table-cell">Date</TableHead>
							<TableHead className="hidden w-20 sm:table-cell">Type</TableHead>
							<TableHead className="w-20">Link</TableHead>
							<TableHead className="w-20">Reminded</TableHead>
							<TableHead className="w-20">Status</TableHead>
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
											<QuestionnaireActionsMenu questionnaire={questionnaire} />
										</TableCell>
									)}
									<TableCell className="hidden sm:table-cell">
										{questionnaire.sent
											? new Intl.DateTimeFormat("en-US", {
													year: "2-digit",
													month: "numeric",
													day: "numeric",
													timeZone: "UTC",
												}).format(new Date(questionnaire.sent))
											: "N/A"}
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
								</TableRow>
							))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
