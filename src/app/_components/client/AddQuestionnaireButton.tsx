"use client";
import { Button } from "@ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@ui/dialog";
import { useEffect, useState } from "react";
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

	const [qsSentDialog, setQsSentDialog] = useState(false);
	const [shouldBlockNavigation, setShouldBlockNavigation] = useState(false);

	const { data: qsSent } = api.google.getQsSent.useQuery(
		clientId ? clientId.toString() : "",
		{
			enabled: !!clientId,
		},
	);

	const { mutate: setQsSent } = api.google.setQsSent.useMutation({
		onSuccess: () => {
			utils.google.getQsSent.invalidate(clientId?.toString() ?? "");
			setQsSentDialog(false);
			setShouldBlockNavigation(false);
		},
	});

	useEffect(() => {
		if (!shouldBlockNavigation) return;

		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			setQsSentDialog(true);
			return "";
		};

		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, [shouldBlockNavigation]);

	const addQuestionnaire = api.questionnaires.addQuestionnaire.useMutation({
		onSuccess: () => {
			utils.questionnaires.getSentQuestionnaires.invalidate(clientId);
			addSingleQDialog.closeDialog();

			qsSent &&
				(!qsSent?.["DA Qs Sent"] || !qsSent?.["EVAL Qs Sent"]) &&
				setShouldBlockNavigation(true);
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
				qsSent &&
					(!qsSent?.["DA Qs Sent"] || !qsSent?.["EVAL Qs Sent"]) &&
					setQsSentDialog(true);
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

	const handleSetDASent = () => {
		if (clientId) {
			setQsSent({ id: clientId.toString(), daSent: true });
		}
	};

	const handleSetEvalSent = () => {
		if (clientId) {
			setQsSent({ id: clientId.toString(), evalSent: true });
		}
	};

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
		<div className="flex items-center gap-2">
			{qsSent && !qsSent?.["DA Qs Sent"] && clientId ? (
				<Button onClick={handleSetDASent} size="sm" variant="secondary">
					Set DA Sent
				</Button>
			) : null}

			{qsSent && !qsSent?.["EVAL Qs Sent"] && clientId ? (
				<Button onClick={handleSetEvalSent} size="sm" variant="secondary">
					Set Eval Sent
				</Button>
			) : null}

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

			<Dialog onOpenChange={() => {}} open={qsSentDialog}>
				<DialogContent className="sm:max-w-md" showCloseButton={false}>
					<DialogHeader>
						<DialogTitle>Questionnaires Sent</DialogTitle>
						<DialogDescription>
							You added questionnaires, do you need to mark the whole group
							sent?
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-3 pt-4">
						{qsSent && !qsSent?.["DA Qs Sent"] && clientId && (
							<Button
								className="w-full"
								onClick={handleSetDASent}
								variant="secondary"
							>
								Set DA Sent
							</Button>
						)}
						{qsSent && !qsSent?.["EVAL Qs Sent"] && clientId && (
							<Button
								className="w-full"
								onClick={handleSetEvalSent}
								variant="secondary"
							>
								Set Eval Sent
							</Button>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
