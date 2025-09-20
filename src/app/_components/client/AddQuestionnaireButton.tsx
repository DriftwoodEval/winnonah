"use client";
import { toast } from "sonner";
import { useMediaQuery } from "~/hooks/use-media-query";
import { logger } from "~/lib/logger";
import { api } from "~/trpc/react";
import {
	ResponsiveDialog,
	useResponsiveDialog,
} from "../shared/ResponsiveDialog";
import { SplitButton } from "../shared/SplitButton";
import {
	QuestionnaireBulkForm,
	type QuestionnaireBulkFormValues,
} from "./QuestionnaireBulkForm";
import type { QuestionnaireTableFormValues } from "./QuestionnaireTableForm";
import { QuestionnaireTableForm } from "./QuestionnaireTableForm";

const log = logger.child({ module: "AddQuestionnaireButton" });

interface AddQuestionnaireButtonProps {
	clientId: number | undefined;
}

export function AddQuestionnaireButton({
	clientId,
}: AddQuestionnaireButtonProps) {
	const addSingleQDialog = useResponsiveDialog();
	const addBulkQDialog = useResponsiveDialog();
	const utils = api.useUtils();
	const isDesktop = useMediaQuery("(min-width: 768px)");

	const addQuestionnaire = api.questionnaires.addQuestionnaire.useMutation({
		onSuccess: () => {
			utils.questionnaires.getSentQuestionnaires.invalidate(clientId);
			addSingleQDialog.closeDialog();
		},
		onError: (error) => {
			log.error(error, "Failed to add questionnaire:");
			toast.error("Failed to add questionnaire", {
				description: String(error.message),
			});
		},
	});

	const addBulkQuestionnaires =
		api.questionnaires.addBulkQuestionnaires.useMutation({
			onSuccess: () => {
				utils.questionnaires.getSentQuestionnaires.invalidate(clientId);
				addBulkQDialog.closeDialog();
			},
			onError: (error) => {
				log.error(error, "Failed to add bulk questionnaires:");
				toast.error("Failed to add bulk questionnaires", {
					description: String(error.message),
				});
			},
		});

	function onSingleQSubmit(values: QuestionnaireTableFormValues) {
		if (typeof clientId !== "number") return;

		addQuestionnaire.mutate({
			clientId: clientId,
			questionnaireType: values.questionnaireType,
			link: values.link,
			sent: values.sent,
			status: values.status,
		});
	}

	function onBulkQSubmit(values: QuestionnaireBulkFormValues) {
		if (typeof clientId !== "number") return;

		addBulkQuestionnaires.mutate({
			clientId: clientId,
			text: values.text,
		});
	}

	const addQTrigger = (
		<SplitButton
			disabled={!clientId}
			dropdownItems={[
				{ label: "Bulk Add", onClick: () => addBulkQDialog.openDialog() },
			]}
			mainButtonText={isDesktop ? "Add Questionnaire" : "Add"}
		/>
	);

	const addQContent =
		typeof clientId === "number" ? (
			<QuestionnaireTableForm
				clientId={clientId}
				isLoading={addQuestionnaire.isPending}
				newQ={true}
				onSubmit={onSingleQSubmit}
			/>
		) : (
			<p className="text-center text-muted-foreground">Client not specified.</p>
		);

	return (
		<>
			<ResponsiveDialog
				open={addSingleQDialog.open}
				setOpen={addSingleQDialog.setOpen}
				title="Add New Questionnaire"
				trigger={addQTrigger}
			>
				{addQContent}
			</ResponsiveDialog>

			<ResponsiveDialog
				open={addBulkQDialog.open}
				setOpen={addBulkQDialog.setOpen}
				title="Bulk Add Questionnaires"
			>
				{typeof clientId === "number" ? (
					<QuestionnaireBulkForm onSubmit={onBulkQSubmit} />
				) : (
					<p className="text-center text-muted-foreground">
						Client not specified.
					</p>
				)}
			</ResponsiveDialog>
		</>
	);
}
