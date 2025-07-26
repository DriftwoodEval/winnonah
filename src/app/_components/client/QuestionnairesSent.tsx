"use client";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@components/ui/table";
import Link from "next/link";
import { api } from "~/trpc/react";
import { AddQuestionnaireButton } from "./AddQuestionnaireButton";

interface QuestionnairesSentProps {
	clientId: number | undefined;
	asanaId: string | undefined | null;
}

export function QuestionnairesSent({
	clientId,
	asanaId,
}: QuestionnairesSentProps) {
	const { data: questionnairesSent, isLoading: isLoadingQuestionnaires } =
		api.clients.getSentQuestionnaires.useQuery(clientId ?? 0, {
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
		<div className="max-h-52 w-full overflow-scroll rounded-md border shadow">
			<div className="sticky top-0 z-10 flex items-center gap-2 bg-background p-4">
				<h4 className="font-bold leading-none">Questionnaires Sent</h4>
				<AddQuestionnaireButton asanaId={asanaId} clientId={clientId} />
			</div>
			<div className="px-4 pb-4">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-[100px]">Date</TableHead>
							<TableHead className="w-[100px]">Type</TableHead>
							<TableHead className="w-[100px]">Link</TableHead>
							<TableHead className="w-[100px]">Reminded</TableHead>
							<TableHead className="w-[100px]">Status</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{questionnairesSent?.map((questionnaire) => (
							<TableRow key={questionnaire.id}>
								<TableCell>
									{questionnaire.sent
										? new Intl.DateTimeFormat("en-US", {
												year: "2-digit",
												month: "numeric",
												day: "numeric",
											}).format(new Date(questionnaire.sent))
										: ""}
								</TableCell>
								<TableCell>{questionnaire.questionnaireType}</TableCell>
								<TableCell>
									<Link
										className="text-primary hover:underline"
										href={questionnaire.link}
										rel="noopener noreferrer"
										target="_blank"
									>
										{truncateLink(questionnaire.link)}
									</Link>
								</TableCell>
								<TableCell>{questionnaire.reminded}</TableCell>
								<TableCell>{questionnaire.status}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
