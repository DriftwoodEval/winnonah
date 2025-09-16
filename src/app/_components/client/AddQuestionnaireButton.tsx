"use client";
import { Button } from "@ui/button";
import { toast } from "sonner";
import { logger } from "~/lib/logger";
import { api } from "~/trpc/react";
import {
	ResponsiveDialog,
	useResponsiveDialog,
} from "../shared/ResponsiveDialog";
import type { QuestionnaireTableFormValues } from "./QuestionnaireTableForm";
import { QuestionnaireTableForm } from "./QuestionnaireTableForm";

const log = logger.child({ module: "AddQuestionnaireButton" });

interface AddQuestionnaireButtonProps {
	clientId: number | undefined;
}

export function AddQuestionnaireButton({
	clientId,
}: AddQuestionnaireButtonProps) {
	const dialog = useResponsiveDialog();
	const utils = api.useUtils();

	const addQuestionnaire = api.questionnaires.addQuestionnaire.useMutation({
		onSuccess: () => {
			utils.questionnaires.getSentQuestionnaires.invalidate(clientId);
			dialog.closeDialog();
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

	const trigger = (
		<Button disabled={!clientId} size="sm">
			<span className="hidden sm:block">Add Questionnaire</span>
			<span className="sm:hidden">Add</span>
		</Button>
	);

	const content =
		typeof clientId === "number" ? (
			<QuestionnaireTableForm
				clientId={clientId}
				isLoading={addQuestionnaire.isPending}
				newQ={true}
				onFinished={dialog.closeDialog}
				onSubmit={onSubmit}
			/>
		) : (
			<p className="text-center text-muted-foreground">Client not specified.</p>
		);

	return (
		<ResponsiveDialog
			open={dialog.open}
			setOpen={dialog.setOpen}
			title="Add New Questionnaire"
			trigger={trigger}
		>
			{content}
		</ResponsiveDialog>
	);
}
