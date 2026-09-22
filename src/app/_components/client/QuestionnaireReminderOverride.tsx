"use client";

import { Button } from "@ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ui/dialog";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { HighlightedPreview } from "~/app/_components/shared/PlaceholderHighlight";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { QUESTIONNAIRE_REMINDER_STAGES } from "~/lib/constants";
import { formatShortDate } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";

type ReminderOverride =
	RouterOutputs["questionnaires"]["getReminderOverrides"][number];
type ReminderTemplate =
	RouterOutputs["questionnaires"]["getReminderTemplates"][number];

interface StageEditorProps {
	clientId: number;
	sent: string;
	reminderIndex: number;
	label: string;
	existing: ReminderOverride | undefined;
	defaultTemplateText: string;
	previewValues: Record<string, string>;
	canEdit: boolean;
	alreadySent: boolean;
}

function StageEditor({
	clientId,
	sent,
	reminderIndex,
	label,
	existing,
	defaultTemplateText,
	previewValues,
	canEdit,
	alreadySent,
}: StageEditorProps) {
	const utils = api.useUtils();
	const baseline = existing?.message ?? defaultTemplateText;
	const [draft, setDraft] = useState(baseline);
	const editable = canEdit && !alreadySent;

	useEffect(() => {
		setDraft(baseline);
	}, [baseline]);

	const setOverride = api.questionnaires.setReminderOverride.useMutation({
		onSuccess: () => {
			void utils.questionnaires.getReminderOverrides.invalidate(clientId);
			toast.success("Reminder override saved");
		},
		onError: (err) =>
			toast.error("Failed to save override", { description: err.message }),
	});

	const clearOverride = api.questionnaires.clearReminderOverride.useMutation({
		onSuccess: () => {
			void utils.questionnaires.getReminderOverrides.invalidate(clientId);
		},
		onError: (err) =>
			toast.error("Failed to clear override", { description: err.message }),
	});

	const isDirty = draft.trim() !== baseline.trim();

	function handleSave() {
		const trimmed = draft.trim();
		if (!trimmed) return;
		if (trimmed === defaultTemplateText.trim()) {
			if (existing) {
				clearOverride.mutate(
					{ clientId, sent, reminderIndex },
					{
						onSuccess: () =>
							toast.success("Matches the default message, reverted to default"),
					},
				);
			} else {
				toast.info("Matches the default message, nothing to save.");
			}
			return;
		}
		setOverride.mutate({ clientId, sent, reminderIndex, message: trimmed });
	}

	return (
		<div className="space-y-1.5">
			<Label className="text-sm">{label}</Label>
			{alreadySent && (
				<p className="text-amber-600 text-xs dark:text-amber-500">
					This reminder has already gone out for this batch (or the reminder
					limit has been reached), so it can no longer be edited.
				</p>
			)}
			<div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
				<Textarea
					className="min-h-24 text-sm"
					disabled={!editable}
					onChange={(e) => setDraft(e.target.value)}
					value={draft}
				/>
				<div className="rounded border bg-muted/40 p-2 text-xs">
					<span className="text-muted-foreground">Preview: </span>
					{draft ? (
						<HighlightedPreview
							className="inline"
							template={draft}
							values={previewValues}
						/>
					) : (
						<span className="text-muted-foreground italic">Empty</span>
					)}
				</div>
			</div>
			<div className="flex items-center gap-2">
				<Button
					disabled={
						!editable ||
						!isDirty ||
						!draft.trim() ||
						setOverride.isPending ||
						clearOverride.isPending
					}
					onClick={handleSave}
					size="sm"
				>
					Save
				</Button>
				{existing && (
					<Button
						disabled={!editable || clearOverride.isPending}
						onClick={() =>
							clearOverride.mutate(
								{ clientId, sent, reminderIndex },
								{
									onSuccess: () => toast.success("Reminder override cleared"),
								},
							)
						}
						size="sm"
						variant="outline"
					>
						Revert to default
					</Button>
				)}
			</div>
		</div>
	);
}

interface QuestionnaireReminderOverrideDialogProps {
	clientId: number;
	sent: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function QuestionnaireReminderOverrideDialog({
	clientId,
	sent,
	open,
	onOpenChange,
}: QuestionnaireReminderOverrideDialogProps) {
	const can = useCheckPermission();
	const canEdit = can("clients:questionnaires:overridereminder");

	const { data: overrides } = api.questionnaires.getReminderOverrides.useQuery(
		clientId,
		{ enabled: open },
	);
	const { data: templates } = api.questionnaires.getReminderTemplates.useQuery(
		undefined,
		{ enabled: open },
	);
	const { data: previewData } =
		api.questionnaires.getReminderPreviewValues.useQuery(
			{ clientId, sent },
			{ enabled: open },
		);

	const forSent = overrides?.filter((o) => o.sent === sent) ?? [];

	const findDefault = (reminderIndex: number): ReminderTemplate | undefined =>
		templates?.find(
			(t) =>
				t.reminderIndex === reminderIndex &&
				t.variant === (previewData?.variant ?? "DEFAULT"),
		);

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-h-[calc(100vh-4rem)] max-w-2xl overflow-y-auto xl:max-w-4xl">
				<DialogHeader>
					<DialogTitle>
						Customize Reminder Messages ({formatShortDate(sent)})
					</DialogTitle>
				</DialogHeader>
				<p className="text-muted-foreground text-xs">
					Applies to every questionnaire sent to this client on this date. Each
					stage starts pre-filled with the current default message for this
					client, edit it to override just that stage. Placeholders (like
					$CLIENT_FIRST_NAME) work the same as in the default messages. Saving
					text identical to the default does nothing.
				</p>
				<div className="space-y-6">
					{QUESTIONNAIRE_REMINDER_STAGES.map((stage) => (
						<StageEditor
							alreadySent={(previewData?.remindedCount ?? 0) > stage.index}
							canEdit={canEdit}
							clientId={clientId}
							defaultTemplateText={findDefault(stage.index)?.message ?? ""}
							existing={forSent.find((o) => o.reminderIndex === stage.index)}
							key={stage.index}
							label={stage.label}
							previewValues={previewData?.values ?? {}}
							reminderIndex={stage.index}
							sent={sent}
						/>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}

interface QuestionnaireReminderOverridesSummaryProps {
	clientId: number;
	sentDates: string[];
	readOnly?: boolean;
}

export function QuestionnaireReminderOverridesSummary({
	clientId,
	sentDates,
	readOnly,
}: QuestionnaireReminderOverridesSummaryProps) {
	const [openSent, setOpenSent] = useState<string | null>(null);
	const { data: overrides } = api.questionnaires.getReminderOverrides.useQuery(
		clientId,
		{ enabled: sentDates.length > 0 },
	);

	if (readOnly || sentDates.length === 0) return null;

	return (
		<div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
			<span className="text-muted-foreground text-xs">Reminder overrides:</span>
			{sentDates.map((sent) => {
				const count = overrides?.filter((o) => o.sent === sent).length ?? 0;
				return (
					<Button
						key={sent}
						onClick={() => setOpenSent(sent)}
						size="sm"
						variant="outline"
					>
						{formatShortDate(sent)}
						{count > 0 ? ` (${count} of 3 customized)` : ""}
					</Button>
				);
			})}
			{openSent && (
				<QuestionnaireReminderOverrideDialog
					clientId={clientId}
					onOpenChange={(o) => !o && setOpenSent(null)}
					open={!!openSent}
					sent={openSent}
				/>
			)}
		</div>
	);
}
