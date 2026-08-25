"use client";

import { Button } from "@ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/card";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { HighlightedPreview } from "~/app/_components/shared/PlaceholderHighlight";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { QUESTIONNAIRE_REMINDER_STAGES } from "~/lib/constants";
import {
	REMINDER_PLACEHOLDERS,
	REMINDER_PORTAL_LINK,
	reminderDeadlineDate,
	reminderPluralization,
} from "~/lib/reminder-messages";
import { getSmsSegmentInfo } from "~/lib/sms";
import { formatInBusinessTime } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";

type ReminderTemplate =
	RouterOutputs["questionnaires"]["getReminderTemplates"][number];
type ReminderSettings = RouterOutputs["questionnaires"]["getReminderSettings"];

const VARIANTS = [
	{ key: "DEFAULT", label: "Default" },
	{ key: "POSTDA", label: "Post-DA, awaiting eval" },
	{ key: "POSTEVAL", label: "Post-eval" },
] as const;

function SmsSegmentCounter({ text }: { text: string }) {
	const { length, encoding, segments } = getSmsSegmentInfo(text);
	if (length === 0) return null;
	return (
		<p className="text-[10px] text-muted-foreground">
			{length} characters ({encoding}) &middot;{" "}
			{segments === 1 ? "1 text message" : `${segments} text messages`}
		</p>
	);
}

function samplePreviewValues(
	settings: ReminderSettings | undefined,
	staffName: string,
) {
	const escalationDays = settings?.escalationSilenceDays ?? 3;
	const todayBusiness = formatInBusinessTime(new Date(), "yyyy-MM-dd");
	return {
		$CLIENT_FIRST_NAME: "Alex",
		$STAFF_NAME: staffName || "Jordan",
		...reminderPluralization(2),
		$DISTANCE_PHRASE: "on 3/14 (5 days ago)",
		$DEADLINE_DATE: reminderDeadlineDate(todayBusiness, escalationDays),
		$ESCALATION_DAYS: String(escalationDays),
		$PORTAL_LINK: REMINDER_PORTAL_LINK,
		$COMPLETED_COUNT: "1",
		$REMAINING_COUNT: "2",
	};
}

interface CadenceCardProps {
	settings: ReminderSettings | undefined;
	canEdit: boolean;
}

function CadenceCard({ settings, canEdit }: CadenceCardProps) {
	const utils = api.useUtils();
	const [stage2OffsetDays, setStage2OffsetDays] = useState(
		settings?.stage2OffsetDays ?? 14,
	);
	const [stage3OffsetDays, setStage3OffsetDays] = useState(
		settings?.stage3OffsetDays ?? 7,
	);
	const [escalationSilenceDays, setEscalationSilenceDays] = useState(
		settings?.escalationSilenceDays ?? 3,
	);

	useEffect(() => {
		if (!settings) return;
		setStage2OffsetDays(settings.stage2OffsetDays);
		setStage3OffsetDays(settings.stage3OffsetDays);
		setEscalationSilenceDays(settings.escalationSilenceDays);
	}, [settings]);

	const updateSettings = api.questionnaires.updateReminderSettings.useMutation({
		onSuccess: () => {
			void utils.questionnaires.getReminderSettings.invalidate();
			toast.success("Cadence saved");
		},
		onError: (err) =>
			toast.error("Failed to save cadence", { description: err.message }),
	});

	const isDirty =
		!!settings &&
		(stage2OffsetDays !== settings.stage2OffsetDays ||
			stage3OffsetDays !== settings.stage3OffsetDays ||
			escalationSilenceDays !== settings.escalationSilenceDays);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Cadence</CardTitle>
				<CardDescription>
					How many days pass between each reminder, and how long a client can go
					silent after the final reminder before being moved to the manual call
					list.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-3 gap-4">
					<div className="space-y-2">
						<Label>Days before 2nd reminder</Label>
						<Input
							disabled={!canEdit}
							onChange={(e) => setStage2OffsetDays(Number(e.target.value))}
							type="number"
							value={stage2OffsetDays}
						/>
					</div>
					<div className="space-y-2">
						<Label>Days before 3rd reminder</Label>
						<Input
							disabled={!canEdit}
							onChange={(e) => setStage3OffsetDays(Number(e.target.value))}
							type="number"
							value={stage3OffsetDays}
						/>
					</div>
					<div className="space-y-2">
						<Label>Silent days before escalation</Label>
						<Input
							disabled={!canEdit}
							onChange={(e) => setEscalationSilenceDays(Number(e.target.value))}
							type="number"
							value={escalationSilenceDays}
						/>
					</div>
				</div>
				<Button
					disabled={!canEdit || !isDirty || updateSettings.isPending}
					onClick={() =>
						updateSettings.mutate({
							stage2OffsetDays,
							stage3OffsetDays,
							escalationSilenceDays,
						})
					}
					size="sm"
				>
					Save
				</Button>
			</CardContent>
		</Card>
	);
}

interface TemplateEditorProps {
	template: ReminderTemplate | undefined;
	canEdit: boolean;
	previewValues: Record<string, string>;
	onSaved: () => void;
}

function TemplateEditor({
	template,
	canEdit,
	previewValues,
	onSaved,
}: TemplateEditorProps) {
	const [draft, setDraft] = useState(template?.message ?? "");

	useEffect(() => {
		setDraft(template?.message ?? "");
	}, [template?.message]);

	const updateTemplate = api.questionnaires.updateReminderTemplate.useMutation({
		onSuccess: () => {
			onSaved();
			toast.success("Reminder message saved");
		},
		onError: (err) =>
			toast.error("Failed to save reminder message", {
				description: err.message,
			}),
	});

	const isDirty = draft.trim() !== (template?.message ?? "").trim();

	return (
		<div className="space-y-1">
			<Textarea
				className="min-h-32 font-mono text-xs"
				disabled={!canEdit || !template}
				onChange={(e) => setDraft(e.target.value)}
				value={draft}
			/>
			<SmsSegmentCounter text={draft} />
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
			<Button
				disabled={
					!canEdit ||
					!template ||
					!isDirty ||
					!draft.trim() ||
					updateTemplate.isPending
				}
				onClick={() => {
					if (!template) return;
					updateTemplate.mutate({ id: template.id, message: draft.trim() });
				}}
				size="sm"
			>
				Save
			</Button>
		</div>
	);
}

export default function QuestionnaireRemindersSettings() {
	const utils = api.useUtils();
	const can = useCheckPermission();
	const canEdit = can("settings:questionnaireRules");

	const { data: settings } = api.questionnaires.getReminderSettings.useQuery();
	const { data: templates } =
		api.questionnaires.getReminderTemplates.useQuery();
	const { data: pyConfig } = api.pyConfig.get.useQuery();

	const previewValues = samplePreviewValues(
		settings,
		pyConfig?.config.name ?? "",
	);

	const findTemplate = (
		reminderIndex: number,
		variant: string,
	): ReminderTemplate | undefined =>
		templates?.find(
			(t) => t.reminderIndex === reminderIndex && t.variant === variant,
		);

	return (
		<div className="space-y-8 px-4">
			<h3 className="font-bold text-lg">Questionnaire Reminders</h3>

			<CadenceCard canEdit={canEdit} settings={settings} />

			<Card>
				<CardHeader>
					<CardTitle>Reminder Messages</CardTitle>
					<CardDescription>
						The default text sent for each reminder stage. "Post-DA" and
						"Post-eval" variants are used automatically when the client has a
						questionnaire pending after a DA or full evaluation. The preview
						below each message uses sample values (Alex, 2 pending
						questionnaires). Available placeholders:{" "}
						{REMINDER_PLACEHOLDERS.map(([token, desc]) => (
							<span className="mr-2 inline-block" key={token}>
								<code className="rounded bg-muted px-1 font-mono text-xs">
									{token}
								</code>{" "}
								<span className="text-muted-foreground text-xs">({desc})</span>
							</span>
						))}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					{QUESTIONNAIRE_REMINDER_STAGES.map((stage) => (
						<div className="space-y-3" key={stage.index}>
							<h4 className="font-semibold text-sm">{stage.label}</h4>
							<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
								{VARIANTS.map((variant) => (
									<div className="space-y-1" key={variant.key}>
										<Label className="text-muted-foreground text-xs">
											{variant.label}
										</Label>
										<TemplateEditor
											canEdit={canEdit}
											onSaved={() => {
												void utils.questionnaires.getReminderTemplates.invalidate();
											}}
											previewValues={previewValues}
											template={findTemplate(stage.index, variant.key)}
										/>
									</div>
								))}
							</div>
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	);
}
