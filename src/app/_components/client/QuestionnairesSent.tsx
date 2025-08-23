"use client";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
	checkRole,
	cn,
	getReminderColorClass,
	getStatusColorClass,
} from "~/lib/utils";
import { api } from "~/trpc/react";
import { AddQuestionnaireButton } from "./AddQuestionnaireButton";
import { QuestionnaireActionsMenu } from "./QuestionnaireTableActionsMenu";

interface QuestionnairesSentProps {
	clientId: number | undefined;
}

export function QuestionnairesSent({ clientId }: QuestionnairesSentProps) {
	const { data: session } = useSession();
	const admin = session ? checkRole(session.user.role, "admin") : false;

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
		<div className="max-h-80 w-full overflow-scroll rounded-md border shadow">
			<div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-background p-4">
				<h4 className="font-bold leading-none sm:hidden">Questionnaires</h4>
				<h4 className="hidden font-bold leading-none sm:block">
					Questionnaires Sent
				</h4>
				{admin && <AddQuestionnaireButton clientId={clientId} />}
			</div>
			<div className="px-4 pb-4">
				<Table>
					<TableHeader>
						<TableRow>
							{admin && <TableHead className="w-[20px]"></TableHead>}
							<TableHead className="w-[100px]">Date</TableHead>
							<TableHead className="hidden w-[100px] sm:table-cell">
								Type
							</TableHead>
							<TableHead className="w-[100px]">Link</TableHead>
							<TableHead className="w-[100px]">Reminded</TableHead>
							<TableHead className="w-[100px]">Status</TableHead>
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
						{questionnairesSent?.map((questionnaire) => (
							<TableRow key={questionnaire.id}>
								{admin && (
									<TableCell>
										<QuestionnaireActionsMenu questionnaire={questionnaire} />
									</TableCell>
								)}
								<TableCell>
									{questionnaire.sent
										? new Intl.DateTimeFormat("en-US", {
												year: "2-digit",
												month: "numeric",
												day: "numeric",
											}).format(new Date(questionnaire.sent))
										: ""}
								</TableCell>
								<TableCell className="hidden sm:table-cell">
									{questionnaire.questionnaireType}
								</TableCell>
								<TableCell className="hidden sm:table-cell">
									<Link
										className="text-primary hover:underline"
										href={questionnaire.link}
										rel="noopener noreferrer"
										target="_blank"
									>
										{truncateLink(questionnaire.link)}
									</Link>
								</TableCell>
								<TableCell className="table-cell sm:hidden">
									<Link
										className="text-primary hover:underline"
										href={questionnaire.link}
										rel="noopener noreferrer"
										target="_blank"
									>
										{questionnaire.questionnaireType}
									</Link>
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
