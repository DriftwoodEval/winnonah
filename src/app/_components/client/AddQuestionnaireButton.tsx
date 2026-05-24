"use client";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { ButtonGroup } from "@ui/button-group";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@ui/dialog";
import { CheckCircle2, CopyPlus, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { useMediaQuery } from "~/hooks/use-media-query";
import { logger } from "~/lib/logger";
import { api } from "~/trpc/react";
import {
	ResponsiveDialog,
	useResponsiveDialog,
} from "../shared/ResponsiveDialog";
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
	const can = useCheckPermission();
	const canAddSingle = can("clients:questionnaires:create");
	const canAddExternal = can("clients:questionnaires:createexternal");
	const canBulk = can("clients:questionnaires:createbulk");

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

	const { data: applicableRules } =
		api.questionnaires.getApplicableRules.useQuery(
			{ clientId: clientId ?? 0 },
			{ enabled: !!clientId },
		);

	const { data: sentQuestionnaires } =
		api.questionnaires.getSentQuestionnaires.useQuery(clientId ?? 0, {
			enabled: !!clientId,
		});

	/**
	 * For each daeval group in the applicable battery, determine whether every
	 * required online questionnaire is already present in the client's sent
	 * questionnaire list.
	 */
	const batteryCompleteness = useMemo(() => {
		if (!applicableRules?.rules.length || !sentQuestionnaires) return null;

		const activeTypes = new Set(
			sentQuestionnaires
				.filter((q) => q.status !== "ARCHIVED")
				.map((q) => q.questionnaireType),
		);

		// Combine all rules for a given daeval into a single deduplicated list
		const groups = new Map<string, string[]>();
		for (const rule of applicableRules.rules) {
			const existing = groups.get(rule.daeval) ?? [];
			for (const q of rule.questionnaires) {
				if (!existing.includes(q)) existing.push(q);
			}
			groups.set(rule.daeval, existing);
		}

		const result: Record<
			string,
			{ questionnaires: string[]; complete: boolean }
		> = {};
		for (const [daeval, qs] of groups) {
			result[daeval] = {
				questionnaires: qs,
				complete: qs.length > 0 && qs.every((q) => activeTypes.has(q)),
			};
		}
		return result;
	}, [applicableRules, sentQuestionnaires]);

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
		onSuccess: (data) => {
			utils.questionnaires.getSentQuestionnaires.invalidate(clientId);
			addSingleQDialog.closeDialog();

			qsSent &&
				["PENDING", "COMPLETED", "IGNORING", "SPANISH", "LANGUAGE"].includes(
					data?.status ?? "",
				) &&
				(!qsSent?.["DA Qs Sent"] || !qsSent?.["EVAL Qs Sent"]) &&
				setShouldBlockNavigation(true);
		},
		onError: (error) => {
			log.error(error, "Failed to add questionnaire:");
			toast.error("Failed to add questionnaire", {
				description: String(error.message),
				duration: 10000,
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
					duration: 10000,
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
			setShouldBlockNavigation(false);
		}
	};

	const handleSetEvalSent = () => {
		if (clientId) {
			setQsSent({ id: clientId.toString(), evalSent: true });
			setShouldBlockNavigation(false);
		}
	};

	const handleSetBothSent = () => {
		if (clientId) {
			setQsSent({ id: clientId.toString(), daSent: true, evalSent: true });
			setShouldBlockNavigation(false);
		}
	};

	const addQTrigger = (
		<Button disabled={!clientId} size="sm" variant="outline">
			{isDesktop ? (
				<span className="flex items-center gap-2">
					<Plus /> Add Questionnaire
				</span>
			) : (
				<Plus />
			)}
		</Button>
	);

	const addQContent =
		typeof clientId === "number" ? (
			<QuestionnaireTableForm
				clientId={clientId}
				externalOnly={canAddExternal && !canAddSingle}
				isLoading={addQuestionnaire.isPending}
				newQ={true}
				onSubmit={onSingleQSubmit}
			/>
		) : (
			<p className="text-center text-muted-foreground">Client not specified.</p>
		);

	return (
		<div className="flex flex-wrap items-center justify-end gap-2">
			{isDesktop && qsSent && !qsSent?.["DA Qs Sent"] && clientId && (
				<Button onClick={handleSetDASent} size="sm" variant="secondary">
					Set DA Sent
				</Button>
			)}

			{isDesktop && qsSent && !qsSent?.["EVAL Qs Sent"] && clientId && (
				<Button onClick={handleSetEvalSent} size="sm" variant="secondary">
					Set Eval Sent
				</Button>
			)}

			{isDesktop &&
				qsSent &&
				!qsSent?.["DA Qs Sent"] &&
				!qsSent?.["EVAL Qs Sent"] &&
				clientId && (
					<Button onClick={handleSetBothSent} size="sm" variant="secondary">
						Set Both Sent
					</Button>
				)}

			<ButtonGroup>
				{(canAddSingle || canAddExternal) && (
					<ResponsiveDialog
						open={addSingleQDialog.open}
						setOpen={addSingleQDialog.setOpen}
						title="Add Questionnaire"
						trigger={addQTrigger}
					>
						{addQContent}
					</ResponsiveDialog>
				)}
				{canBulk && (
					<Button
						disabled={!clientId}
						onClick={addBulkQDialog.openDialog}
						size="sm"
						variant="outline"
					>
						{isDesktop ? (
							<span className="flex items-center gap-2">
								<CopyPlus /> Bulk Add
							</span>
						) : (
							<CopyPlus />
						)}
					</Button>
				)}
			</ButtonGroup>

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
							Do you need to mark a group as sent?
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-3 pt-2">
						{/* DA */}
						{qsSent && !qsSent?.["DA Qs Sent"] && clientId && (
							<div className="flex flex-col gap-1.5 rounded-md border p-3">
								{batteryCompleteness?.DA?.complete ? (
									<div className="flex items-start gap-2 text-sm">
										<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
										<span>
											Looks like the full DA battery is here, want to mark it
											sent?
										</span>
									</div>
								) : (
									<p className="text-muted-foreground text-sm">
										Mark DA questionnaires as sent?
									</p>
								)}
								{batteryCompleteness?.DA?.questionnaires.length ? (
									<div className="flex flex-wrap gap-1">
										{batteryCompleteness.DA.questionnaires.map((q) => (
											<Badge className="text-xs" key={q} variant="secondary">
												{q}
											</Badge>
										))}
									</div>
								) : null}
								<Button
									className="mt-1 w-full"
									onClick={handleSetDASent}
									variant="secondary"
								>
									Set DA Sent
								</Button>
							</div>
						)}

						{/* Eval */}
						{qsSent && !qsSent?.["EVAL Qs Sent"] && clientId && (
							<div className="flex flex-col gap-1.5 rounded-md border p-3">
								{batteryCompleteness?.EVAL?.complete ? (
									<div className="flex items-start gap-2 text-sm">
										<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
										<span>
											Looks like the full Eval battery is here, want to mark it
											sent?
										</span>
									</div>
								) : (
									<p className="text-muted-foreground text-sm">
										Mark Eval questionnaires as sent?
									</p>
								)}
								{batteryCompleteness?.EVAL?.questionnaires.length ? (
									<div className="flex flex-wrap gap-1">
										{batteryCompleteness.EVAL.questionnaires.map((q) => (
											<Badge className="text-xs" key={q} variant="secondary">
												{q}
											</Badge>
										))}
									</div>
								) : null}
								<Button
									className="mt-1 w-full"
									onClick={handleSetEvalSent}
									variant="secondary"
								>
									Set Eval Sent
								</Button>
							</div>
						)}

						{/* Combined DA+Eval battery (DAEVAL rules) */}
						{batteryCompleteness?.DAEVAL?.questionnaires.length ? (
							<div className="flex flex-col gap-1.5 rounded-md border p-3">
								{batteryCompleteness.DAEVAL.complete ? (
									<div className="flex items-start gap-2 text-sm">
										<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
										<span>
											Looks like the full DA+Eval battery is here, want to mark
											both sent?
										</span>
									</div>
								) : (
									<p className="text-muted-foreground text-sm">
										DA+Eval battery
									</p>
								)}
								<div className="flex flex-wrap gap-1">
									{batteryCompleteness.DAEVAL.questionnaires.map((q) => (
										<Badge className="text-xs" key={q} variant="secondary">
											{q}
										</Badge>
									))}
								</div>
							</div>
						) : null}

						{/* Set Both Sent shortcut */}
						{qsSent &&
							!qsSent?.["DA Qs Sent"] &&
							!qsSent?.["EVAL Qs Sent"] &&
							clientId && (
								<Button onClick={handleSetBothSent} variant="secondary">
									Set Both Sent
								</Button>
							)}

						<Button
							className="text-muted-foreground"
							onClick={() => {
								setQsSentDialog(false);
								setShouldBlockNavigation(false);
							}}
							variant="ghost"
						>
							Dismiss
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
