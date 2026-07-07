"use client";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@ui/alert";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/dropdown-menu";
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
import { CheckCircle2, ClipboardList, Info } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
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
	sessionStartedAt?: Date | string | null;
	readOnly?: boolean;
}

export function QuestionnairesTable({
	clientId,
	sessionStartedAt,
	readOnly,
}: QuestionnairesTableProps) {
	const sessionStart = sessionStartedAt ? new Date(sessionStartedAt) : null;
	const isPreSession = (q: { sent: Date | null; updatedAt: Date | null }) => {
		if (!sessionStart) return false;
		const date = q.sent ? new Date(q.sent) : q.updatedAt;
		return date ? date < sessionStart : false;
	};
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
	const [bulkStatus, setBulkStatus] = useState<string>("");

	const { data: questionnairesSent, isLoading: isLoadingQuestionnaires } =
		api.questionnaires.getSentQuestionnaires.useQuery(clientId ?? 0, {
			enabled: typeof clientId === "number" && clientId > 0,
		});

	const { data: applicableRules } =
		api.questionnaires.getApplicableRules.useQuery(
			{ clientId: clientId ?? 0 },
			{ enabled: typeof clientId === "number" && clientId > 0 },
		);

	const questionnaireBattery = useMemo(() => {
		if (!applicableRules?.rules.length) return [];

		const activeTypes = new Set(
			(questionnairesSent ?? [])
				.filter((q) => q.status !== "ARCHIVED")
				.map((q) => q.questionnaireType),
		);

		const groups = new Map<string, string[]>();
		for (const rule of applicableRules.rules) {
			const existing = groups.get(rule.daeval) ?? [];
			for (const q of rule.questionnaires) {
				if (!existing.includes(q)) existing.push(q);
			}
			groups.set(rule.daeval, existing);
		}

		return Array.from(groups.entries())
			.filter(([, qs]) => qs.length > 0)
			.map(([daeval, questionnaires]) => ({
				daeval,
				questionnaires: questionnaires.map((q) => ({
					name: q,
					sent: activeTypes.has(q),
				})),
				complete: questionnaires.every((q) => activeTypes.has(q)),
			}));
	}, [applicableRules, questionnairesSent]);

	const can = useCheckPermission();
	const canResolveFailure = can("clients:questionnaires:resolvefailure");

	const { data: allFailures } = api.clients.getFailures.useQuery(clientId);
	const failures = allFailures?.filter(
		(f) =>
			f.daEval !== "Records" ||
			f.reason === "docs not signed" ||
			f.reason === "portal not opened",
	);

	const utils = api.useUtils();

	const resolveFailure = api.clients.resolveFailure.useMutation({
		onSuccess: () => {
			void utils.clients.getFailures.invalidate(clientId);
		},
		onError: (err) =>
			toast.error("Failed to resolve failure", { description: err.message }),
	});

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
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									className="px-2"
									disabled={questionnaireBattery.length === 0}
									size="sm"
									variant="outline"
								>
									<ClipboardList className="h-4 w-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start" className="w-64">
								{questionnaireBattery.map(
									({ daeval, questionnaires, complete }, index) => (
										<div key={daeval}>
											{index > 0 && <DropdownMenuSeparator />}
											<DropdownMenuLabel className="flex items-center gap-1.5">
												{daeval} Battery
												{complete && (
													<CheckCircle2 className="h-3.5 w-3.5 text-primary" />
												)}
											</DropdownMenuLabel>
											<div className="flex flex-wrap gap-1 px-2 pb-2">
												{questionnaires.map((q) => (
													<Badge
														className="text-xs"
														key={q.name}
														variant={q.sent ? "secondary" : "outline"}
													>
														{q.name}
													</Badge>
												))}
											</div>
										</div>
									),
								)}
							</DropdownMenuContent>
						</DropdownMenu>
						{clientId && (
							<ProtocolsScannedCheckbox
								clientId={clientId}
								readOnly={readOnly}
							/>
						)}
					</div>

					{!readOnly && <AddQuestionnaireButton clientId={clientId} />}
				</div>

				{failures && failures.length > 0 && (
					<div className="flex flex-col gap-2 border-t px-4 py-3">
						{failures.map((failure) => (
							<Alert key={failure.reason} variant="destructive">
								<Info className="h-4 w-4" />
								<AlertTitle>
									{failure.reason.charAt(0).toUpperCase() +
										failure.reason.slice(1)}
								</AlertTitle>
								<AlertDescription>
									First noted {formatShortDate(failure.failedDate)}, last
									updated {formatShortDate(failure.updatedAt)}.
								</AlertDescription>
								{canResolveFailure && (
									<AlertAction>
										<Button
											disabled={resolveFailure.isPending}
											onClick={() =>
												clientId &&
												resolveFailure.mutate({
													clientId,
													reason: failure.reason,
												})
											}
											size="sm"
											variant="outline"
										>
											Mark Resolved
										</Button>
									</AlertAction>
								)}
							</Alert>
						))}
					</div>
				)}

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
								<TableRow
									className={cn(isPreSession(questionnaire) && "opacity-50")}
									key={questionnaire.id}
								>
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
										{isPreSession(questionnaire) && (
											<Badge className="mr-1 text-[10px]" variant="outline">
												Previous session
											</Badge>
										)}
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
