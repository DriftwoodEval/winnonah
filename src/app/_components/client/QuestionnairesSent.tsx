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

	return (
		<div className="max-h-52 w-[calc(100vw-32px)] overflow-auto rounded-md border shadow sm:w-4xl">
			<div className="sticky top-0 z-10 flex items-center gap-2 bg-background p-4">
				<h4 className="font-bold leading-none">Questionnaires Sent</h4>
				<AddQuestionnaireButton clientId={clientId} asanaId={asanaId} />
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
												month: "2-digit",
												day: "2-digit",
											}).format(new Date(questionnaire.sent))
										: ""}
								</TableCell>
								<TableCell>{questionnaire.questionnaireType}</TableCell>
								<TableCell>
									<Link
										className="text-primary hover:underline"
										target="_blank"
										rel="noopener noreferrer"
										href={questionnaire.link}
									>
										{questionnaire.link}
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
