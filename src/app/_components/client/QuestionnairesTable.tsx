"use client";

import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Skeleton } from "@ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { Info } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { QUESTIONNAIRE_STATUSES } from "~/lib/constants";
import {
	cn,
	formatShortDate,
	getReminderColorClass,
	getStatusColorClass,
} from "~/lib/utils";
import { api } from "~/trpc/react";
import { AddQuestionnaireButton } from "./AddQuestionnaireButton";
import { ProtocolsScannedCheckbox } from "./ProtocolsScannedCheckbox";
import { QuestionnaireActionsMenu } from "./QuestionnaireTableActionsMenu";
import { ScreenshotButton } from "./ScreenshotButton";

const truncateLink = (link: string | null, maxLength = 25) => {
	if (!link) return "";
	let truncated = link.replace(/^https?:\/\/(www\.)?/, "");
	if (truncated.length > maxLength) {
		truncated = `${truncated.slice(0, maxLength - 3)}...`;
	}
	return truncated;
};

const STATUS_LABELS: Partial<
	Record<(typeof QUESTIONNAIRE_STATUSES)[number], string>
> = {
	POSTEVAL_PENDING: "Post-Eval, Pending",
	POSTDA_PENDING: "Post-DA, Pending",
};

function statusLabel(s: string) {
	return (
		STATUS_LABELS[s as keyof typeof STATUS_LABELS] ??
		`${s.charAt(0).toUpperCase()}${s.slice(1).toLowerCase()}`
	);
}

interface QuestionnairesTableProps {
	clientId: number | undefined;
	readOnly?: boolean;
}

export function QuestionnairesTable({
	clientId,
	readOnly,
}: QuestionnairesTableProps) {
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
	const [bulkStatus, setBulkStatus] = useState<string>("");

	const { data: questionnairesSent, isLoading: isLoadingQuestionnaires } =
		api.questionnaires.getSentQuestionnaires.useQuery(clientId ?? 0, {
			enabled: typeof clientId === "number" && clientId > 0,
		});

	const utils = api.useUtils();

	const bulkUpdate = api.questionnaires.bulkUpdateStatus.useMutation({
		onSuccess: () => {
			void utils.questionnaires.getSentQuestionnaires.invalidate(clientId);
			setSelectedIds(new Set());
			setBulkStatus("");
			toast.success("Questionnaires updated.");
		},
		onError: (err) =>
			toast.error("Failed to update", { description: err.message }),
	});

	const hasJustAdded = questionnairesSent?.some(
		(q) => q.status === "JUST_ADDED",
	);

	const visibleQs =
		questionnairesSent?.filter((q) => q.status !== "ARCHIVED") ?? [];

	const allVisibleIds = visibleQs.map((q) => q.id);
	const allSelected =
		allVisibleIds.length > 0 &&
		allVisibleIds.every((id) => selectedIds.has(id));
	const someSelected = allVisibleIds.some((id) => selectedIds.has(id));

	function toggleAll(checked: boolean) {
		if (checked) {
			setSelectedIds(new Set(allVisibleIds));
		} else {
			setSelectedIds(new Set());
		}
	}

	function toggleOne(id: number, checked: boolean) {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});
	}

	function applyBulkStatus() {
		if (!bulkStatus || selectedIds.size === 0) return;
		bulkUpdate.mutate({
			ids: [...selectedIds],
			status: bulkStatus as (typeof QUESTIONNAIRE_STATUSES)[number],
		});
	}

	return (
		<div className="flex w-full flex-col gap-4">
			{hasJustAdded && (
				<Alert variant="destructive">
					<Info className="h-4 w-4" />
					<AlertTitle>"JUST_ADDED" Questionnaires</AlertTitle>
					<AlertDescription>
						"JUST_ADDED" questionnaires have NOT been sent to the client and
						will not be checked for completion or included in reminders. Send
						them to the client and set them to "Pending".
					</AlertDescription>
				</Alert>
			)}
			<div className="w-full rounded-md border shadow-sm">
				<div className="sticky top-0 z-10 flex items-center justify-between gap-2 p-4">
					<div className="flex items-center gap-4">
						<h4 className="font-bold leading-none">Questionnaires</h4>
						{clientId && (
							<ProtocolsScannedCheckbox
								clientId={clientId}
								readOnly={readOnly}
							/>
						)}
					</div>

					{!readOnly && <AddQuestionnaireButton clientId={clientId} />}
				</div>

				{!readOnly && someSelected && (
					<div className="flex items-center gap-2 border-t bg-muted/40 px-4 py-2">
						<span className="text-muted-foreground text-xs">
							{selectedIds.size} selected
						</span>
						<Select onValueChange={setBulkStatus} value={bulkStatus}>
							<SelectTrigger className="h-7 w-44 text-xs">
								<SelectValue placeholder="Set status..." />
							</SelectTrigger>
							<SelectContent>
								{QUESTIONNAIRE_STATUSES.filter(
									(s) => s !== "ARCHIVED" && s !== "JUST_ADDED",
								).map((s) => (
									<SelectItem key={s} value={s}>
										{statusLabel(s)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button
							disabled={!bulkStatus || bulkUpdate.isPending}
							onClick={applyBulkStatus}
							size="sm"
							variant="secondary"
						>
							{bulkUpdate.isPending ? "Saving..." : "Apply"}
						</Button>
						<Button
							className="ml-auto"
							onClick={() => setSelectedIds(new Set())}
							size="sm"
							variant="ghost"
						>
							Clear
						</Button>
					</div>
				)}

				<div className="px-4 pb-4">
					<Table className="text-xs">
						<TableHeader>
							<TableRow>
								{!readOnly && (
									<TableHead className="w-8">
										<Checkbox
											checked={
												allSelected
													? true
													: someSelected
														? "indeterminate"
														: false
											}
											onCheckedChange={(c) => toggleAll(!!c)}
										/>
									</TableHead>
								)}
								{!readOnly && <TableHead className="w-8"></TableHead>}
								<TableHead className="hidden w-20 sm:table-cell">
									Date
								</TableHead>
								<TableHead className="w-24">Type</TableHead>
								<TableHead className="hidden w-32 sm:table-cell">
									Link
								</TableHead>
								<TableHead className="hidden w-16 sm:table-cell">
									Reminded
								</TableHead>
								<TableHead className="w-12 sm:w-20">Status</TableHead>
								<TableHead className="w-20">As Of</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{isLoadingQuestionnaires &&
								["sk-q1", "sk-q2", "sk-q3"].map((k) => (
									<TableRow key={k}>
										<TableCell colSpan={7}>
											<Skeleton className="h-4 w-full" />
										</TableCell>
									</TableRow>
								))}
							{visibleQs.map((questionnaire) => (
								<TableRow key={questionnaire.id}>
									{!readOnly && (
										<TableCell>
											<Checkbox
												checked={selectedIds.has(questionnaire.id)}
												onCheckedChange={(c) =>
													toggleOne(questionnaire.id, !!c)
												}
											/>
										</TableCell>
									)}
									{!readOnly && (
										<TableCell>
											<QuestionnaireActionsMenu questionnaire={questionnaire} />
										</TableCell>
									)}
									<TableCell className="hidden sm:table-cell">
										{formatShortDate(questionnaire.sent)}
									</TableCell>
									<TableCell className="w-24 font-medium">
										{questionnaire.link ? (
											<Link
												className="text-primary hover:underline"
												href={questionnaire.link}
												rel="noopener noreferrer"
												target="_blank"
											>
												{questionnaire.questionnaireType}
											</Link>
										) : (
											questionnaire.questionnaireType
										)}
									</TableCell>
									<TableCell className="hidden sm:table-cell">
										{questionnaire.link ? (
											<Link
												className="text-primary hover:underline"
												href={questionnaire.link}
												rel="noopener noreferrer"
												target="_blank"
											>
												{truncateLink(questionnaire.link)}
											</Link>
										) : (
											"N/A"
										)}
									</TableCell>
									<TableCell
										className={cn(
											"hidden sm:table-cell",
											getReminderColorClass(questionnaire.reminded),
										)}
									>
										{questionnaire.reminded}
									</TableCell>
									<TableCell
										className={cn(
											"w-12 sm:w-20",
											getStatusColorClass(questionnaire.status),
										)}
									>
										<span className="sm:hidden">
											{questionnaire.status ? questionnaire.status[0] : "U"}
										</span>
										<span className="hidden sm:inline">
											{questionnaire.status}
										</span>
									</TableCell>
									<TableCell className="w-20">
										{questionnaire.link ? (
											<ScreenshotButton
												className="w-full cursor-pointer text-left hover:underline"
												link={questionnaire.link}
											>
												{formatShortDate(questionnaire.updatedAt)}
											</ScreenshotButton>
										) : (
											formatShortDate(questionnaire.updatedAt)
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</div>
		</div>
	);
}
