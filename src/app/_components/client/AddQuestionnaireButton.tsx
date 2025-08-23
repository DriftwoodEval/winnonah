"use client";
import { Button } from "@ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@ui/dialog";
import { useState } from "react";
import { toast } from "sonner";
import { logger } from "~/lib/logger";
import { api } from "~/trpc/react";
import type { QuestionnaireTableFormValues } from "./QuestionnaireTableForm";
import { QuestionnaireTableForm } from "./QuestionnaireTableForm";

const log = logger.child({ module: "AddQuestionnaireButton" });

interface AddQuestionnaireButtonProps {
	clientId: number | undefined;
}

export function AddQuestionnaireButton({
	clientId,
}: AddQuestionnaireButtonProps) {
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const utils = api.useUtils();

	const addQuestionnaire = api.questionnaires.addQuestionnaire.useMutation({
		onSuccess: () => {
			utils.questionnaires.getSentQuestionnaires.invalidate(clientId);

			setIsDialogOpen(false);
		},
		onError: (error) => {
			log.error(error, "Failed to add questionnaire:");
			toast.error("Failed to add questionnaire", {
				description: String(error.message),
			});
		},
	});

	function onSubmit(values: QuestionnaireTableFormValues) {
		if (typeof clientId !== "number") return;

		addQuestionnaire.mutate({
			clientId: clientId,
			questionnaireType: values.questionnaireType,
			link: values.link,
			sent: values.sent,
		});
	}

	return (
		<Dialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
			<DialogTrigger asChild>
				<Button disabled={!clientId} size="sm">
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
