"use client";
import { Button } from "@components/ui/button";
import { useState } from "react";
import { normalizeDate } from "~/lib/utils";
import { api } from "~/trpc/react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../ui/dialog";
import type { QuestionnaireTableFormValues } from "./QuestionnaireTableForm";
import { QuestionnaireTableForm } from "./QuestionnaireTableForm";

interface AddQuestionnaireButtonProps {
	clientId: number | undefined;
	asanaId: string | undefined | null;
}

export function AddQuestionnaireButton({
	clientId,
	asanaId,
}: AddQuestionnaireButtonProps) {
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const utils = api.useUtils();

	const addQuestionnaireToAsana = api.asana.addQuestionnaires.useMutation({
		onSuccess: (_data, variables) => {
			utils.asana.getProject.invalidate(variables.projectId);
		},
		onError: (error) => {
			console.error("Failed to add questionnaire to Asana:", error);
			// TODO: Implement user-friendly error notification (e.g., toast)
		},
	});

	const addQuestionnaire = api.questionnaires.addQuestionnaire.useMutation({
		onSuccess: (_data, variables) => {
			utils.questionnaires.getSentQuestionnaires.invalidate(clientId);

			setIsDialogOpen(false);

			if (asanaId && asanaId !== "N/A") {
				addQuestionnaireToAsana.mutate({
					projectId: asanaId,
					automatic: false,
					sent: variables.sent,
					questionnaires: [
						{
							type: variables.questionnaireType,
							link: variables.link,
						},
					],
				});
			}
		},
		onError: (error) => {
			console.error("Failed to add questionnaire:", error);
			// TODO: Implement user-friendly error notification (e.g., toast)
		},
	});

	function onSubmit(values: QuestionnaireTableFormValues) {
		if (typeof clientId !== "number") return;

		addQuestionnaire.mutate({
			clientId: clientId,
			questionnaireType: values.questionnaireType,
			link: values.link,
			sent: normalizeDate(values.sent),
		});
	}

	return (
		<Dialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
			<DialogTrigger asChild>
				<Button disabled={!asanaId || asanaId === "N/A" || !clientId} size="sm">
					<span className="hidden sm:block">Add Questionnaire</span>
					<span className="sm:hidden">Add</span>
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add New Questionnaire</DialogTitle>
				</DialogHeader>
				{typeof clientId === "number" ? (
					<QuestionnaireTableForm
						clientId={clientId}
						isLoading={addQuestionnaire.isPending}
						onFinished={() => setIsDialogOpen(false)}
						onSubmit={onSubmit}
						submitButtonText="Add Questionnaire"
					/>
				) : (
					<p className="text-center text-muted-foreground">
						Client not specified.
					</p>
				)}
			</DialogContent>
		</Dialog>
	);
}
