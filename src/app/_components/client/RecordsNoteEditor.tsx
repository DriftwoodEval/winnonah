import { RichTextEditor } from "@components/shared/RichTextEditor";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@ui/alert";
import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import { DatePicker } from "@ui/date-picker";
import { Label } from "@ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Skeleton } from "@ui/skeleton";
import { Textarea } from "@ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { debounce } from "es-toolkit/function";
import { isEqual } from "es-toolkit/predicate";
import { History, Info, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { NOTE_TEMPLATES } from "~/lib/constants";
import { logger } from "~/lib/logger";
import {
	dateOnlyToLocalDate,
	formatShortDate,
	formatShortInstantDate,
	localDateToDateOnly,
} from "~/lib/utils";
import { api } from "~/trpc/react";
import { NoteHistory } from "../shared/NoteHistory";
import { ResponsiveDialog } from "../shared/ResponsiveDialog";
import { EvaluationCheckbox } from "./EvaluationCheckbox";

const log = logger.child({ module: "RecordsNoteEditor" });

// biome-ignore lint/suspicious/noExplicitAny: JSON
const extractTextFromTiptapJson = (tiptapJson: any): string => {
	if (
		!tiptapJson ||
		typeof tiptapJson !== "object" ||
		!Array.isArray(tiptapJson.content)
	) {
		return "";
	}

	let fullText = "";

	// biome-ignore lint/suspicious/noExplicitAny: JSON
	const traverse = (node: any) => {
		if (node.type === "text" && node.text) {
			fullText += node.text;
		}
		if (node.content && Array.isArray(node.content)) {
			node.content.forEach(traverse);
		}
	};

	tiptapJson.content.forEach(traverse);
	return fullText;
};

interface RecordsNoteEditorProps {
	clientId: number;
	readOnly?: boolean;
}

export function RecordsNoteEditor({
	clientId,
	readOnly = false,
}: RecordsNoteEditorProps) {
	const utils = api.useUtils();
	const can = useCheckPermission();

	const canRecordsNeeded = can("clients:records:needed");
	const canRecordRequested = can("clients:records:requested");
	const canRecordNote = can("clients:records:reviewed");
	const canResolveFailure = can("clients:resolvefailure");

	const { data: record, isLoading: isLoadingRecord } =
		api.externalRecords.getExternalRecordByClientId.useQuery(clientId, {
			refetchInterval: 60_000,
			enabled: !!clientId,
		});

	const { data: allFailures } = api.clients.getFailures.useQuery(clientId, {
		refetchInterval: 60_000,
		enabled: !!clientId,
	});
	const recordFailures = allFailures?.filter(
		(f) =>
			f.daEval === "Records" ||
			f.reason === "docs not signed" ||
			f.reason === "portal not opened",
	);
	const resolveFailure = api.clients.resolveFailure.useMutation({
		onSuccess: () => {
			void utils.clients.getFailures.invalidate(clientId);
		},
		onError: (error) =>
			toast.error("Failed to mark failure resolved", {
				description: error.message,
			}),
	});
	api.externalRecords.onExternalRecordNoteUpdate.useSubscription(clientId, {
		enabled: !!clientId,
		onData: (updatedExternalRecordsNote) => {
			log.info(
				{
					clientId,
					updatedExternalRecordsNote,
				},
				"External record note updated",
			);
			utils.externalRecords.getExternalRecordByClientId.invalidate(clientId);
		},
	});

	// Fetch Client for the "recordsNeeded" dropdown
	const { data: client, isLoading: isLoadingClient } =
		api.clients.getOne.useQuery(
			{
				column: "id",
				value: clientId.toString(),
			},
			{ refetchInterval: 60_000, enabled: !!clientId },
		);

	// States
	const [recordsNeeded, setRecordsNeeded] = useState<
		"Needed" | "Not Needed" | undefined
	>();
	const [requests, setRequests] = useState<
		Array<{
			id: number;
			clientId: number;
			requestedDate: string | null;
			holdUntil: string | null;
			customMessage: string | null;
			createdAt: Date;
			createdBy: string | null;
		}>
	>([]);
	const [localContent, setLocalContent] = useState(record?.contentJson ?? "");

	useEffect(() => {
		setRecordsNeeded(client?.recordsNeeded as "Needed" | "Not Needed");
	}, [client?.recordsNeeded]);

	useEffect(() => {
		setRequests(record?.requests ?? []);
	}, [record?.requests]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: We exclude localContent from deps to avoid loops, we only care when note updates
	useEffect(() => {
		if (record?.contentJson && !isEqual(record.contentJson, localContent)) {
			setLocalContent(record.contentJson);
		}
	}, [record?.contentJson]);

	const handleError = (error: unknown, action: string) => {
		const message = error instanceof Error ? error.message : "Unknown error";
		log.error(error, `Failed to ${action}`);
		toast.error(`Failed to ${action}`, {
			description: message,
			duration: 10000,
		});
		if (action.includes("client")) {
			utils.clients.getOne.invalidate({ value: clientId.toString() });
		} else {
			utils.externalRecords.getExternalRecordByClientId.invalidate(clientId);
		}
	};

	const updateClientMutation = api.clients.update.useMutation({
		onSuccess: () => {
			utils.clients.getOne.invalidate({ value: clientId.toString() });
			utils.externalRecords.getExternalRecordByClientId.invalidate(clientId);
		},
		onError: (error) => handleError(error, "update client 'Needed' status"),
	});

	const updateNoteMutation =
		api.externalRecords.updateExternalRecordNote.useMutation({
			onError: (error) => handleError(error, "update record note"),
		});

	const createNoteMutation = api.externalRecords.createRecordNote.useMutation({
		onSuccess: () => {
			utils.externalRecords.getExternalRecordByClientId.invalidate(clientId);
		},
		onError: (error) => handleError(error, "create record note"),
	});

	const flagRecordRequestMutation =
		api.externalRecords.flagRecordRequest.useMutation({
			onSuccess: () => {
				utils.externalRecords.getExternalRecordByClientId.invalidate(clientId);
			},
			onError: (error) => handleError(error, "flag record request"),
		});

	const cancelRecordRequestMutation =
		api.externalRecords.cancelRecordRequest.useMutation({
			onSuccess: () => {
				utils.externalRecords.getExternalRecordByClientId.invalidate(clientId);
			},
			onError: (error) => handleError(error, "cancel record request"),
		});

	const setRecordRequestDateMutation =
		api.externalRecords.setRecordRequestDate.useMutation({
			onSuccess: () => {
				utils.externalRecords.getExternalRecordByClientId.invalidate(clientId);
			},
			onError: (error) => handleError(error, "set record request date"),
		});

	const setRecordRequestMessageMutation =
		api.externalRecords.setRecordRequestMessage.useMutation({
			onError: (error) => handleError(error, "save request message"),
		});

	const setRecordRequestHoldUntilMutation =
		api.externalRecords.setRecordRequestHoldUntil.useMutation({
			onError: (error) => handleError(error, "save hold until date"),
		});

	const stateRef = useRef({
		record,
		updateNoteMutation,
		createNoteMutation,
		clientId,
		canRecordNote,
	});

	useEffect(() => {
		stateRef.current = {
			record,
			updateNoteMutation,
			createNoteMutation,
			clientId,
			canRecordNote,
		};
	});

	const debouncedSaveContent = useMemo(
		() =>
			debounce((editorContent: object) => {
				const {
					record,
					updateNoteMutation,
					createNoteMutation,
					clientId,
					canRecordNote,
				} = stateRef.current;
				if (!clientId || !canRecordNote) return;

				if (record?.clientId) {
					updateNoteMutation.mutate({
						clientId: record.clientId,
						contentJson: editorContent,
					});
				} else {
					createNoteMutation.mutate({
						clientId,
						contentJson: editorContent,
					});
				}
			}, 2000),
		[],
	);

	useEffect(() => {
		return () => {
			// Save on unmount (navigation away from page, browser close, etc.)
			debouncedSaveContent.flush();
			debouncedSaveContent.cancel();
		};
	}, [debouncedSaveContent]);

	const historyTrigger = (
		<Button className="cursor-pointer rounded-full" size="icon" variant="ghost">
			<History />
		</Button>
	);

	const handleNeededChange = (value: string) => {
		const newValue = value as "Needed" | "Not Needed";
		setRecordsNeeded(newValue);

		if (!clientId) return;

		updateClientMutation.mutate({
			clientId: clientId,
			recordsNeeded: newValue,
		});
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: mutation reference is stable
	const debouncedSaveMessage = useMemo(
		() =>
			debounce((requestId: number, message: string) => {
				setRecordRequestMessageMutation.mutate({
					requestId,
					clientId,
					message: message || null,
				});
			}, 1000),
		[clientId],
	);

	const handleFlagRequest = () => {
		if (!clientId) return;
		flagRecordRequestMutation.mutate({ clientId });
	};

	const handleCancelRequest = (requestId: number) => {
		if (!clientId) return;
		cancelRecordRequestMutation.mutate({ requestId, clientId });
	};

	const handleSetRequestDate = (requestId: number, date: Date | undefined) => {
		if (!clientId) return;
		setRecordRequestDateMutation.mutate({
			requestId,
			clientId,
			requestedDate: localDateToDateOnly(date) ?? null,
		});
	};

	const handleSetHoldUntil = (requestId: number, date: Date | undefined) => {
		if (!clientId) return;
		setRecordRequestHoldUntilMutation.mutate({
			requestId,
			clientId,
			holdUntil: localDateToDateOnly(date) ?? null,
		});
	};

	const handleTemplateChange = (value: string) => {
		const template = NOTE_TEMPLATES.find((t) => t.value === value);
		if (!template) return;

		const templateText = template.text;

		const newParagraph = {
			type: "paragraph",
			content: [{ type: "text", text: templateText }],
		};

		const currentContent = localContent || { type: "doc", content: [] };

		// biome-ignore lint/suspicious/noExplicitAny: JSON/TipTap
		let newDoc: any;

		if (
			currentContent &&
			typeof currentContent === "object" &&
			"content" in currentContent &&
			Array.isArray(currentContent.content)
		) {
			const contentArray = currentContent.content;
			const firstNode = contentArray[0];

			const isEffectivelyEmpty =
				contentArray.length === 0 ||
				(contentArray.length === 1 &&
					firstNode.type === "paragraph" &&
					(!firstNode.content || firstNode.content.length === 0));

			if (isEffectivelyEmpty) {
				newDoc = {
					...currentContent,
					content: [newParagraph, { type: "paragraph", content: [] }],
				};
			} else {
				newDoc = {
					...currentContent,
					content: [
						newParagraph,
						{ type: "paragraph", content: [] },
						...contentArray,
					],
				};
			}
		} else {
			// This case handles if localContent is "" or some unexpected format.
			// We just create a new document with the template.
			newDoc = {
				type: "doc",
				content: [newParagraph],
			};
		}

		setLocalContent(newDoc);
		debouncedSaveContent(newDoc);
	};

	const isLoading = isLoadingRecord || isLoadingClient;
	const canEditRecordsNeeded = canRecordsNeeded && !readOnly;
	const canAddRequest =
		canRecordRequested && !readOnly && recordsNeeded === "Needed";

	// Text Editor is editable if records are needed, a request was made, and not read-only
	const isEditorReadOnly =
		!canRecordNote ||
		readOnly ||
		recordsNeeded !== "Needed" ||
		requests.length === 0;

	const tooltipRecordsNeeded = !canRecordNote && "Missing permissions.";

	const tooltipAddRequest = !canRecordRequested && "Missing permissions.";

	const recordsNeededId = useId();
	const newRequestId = useId();

	const editorKey = `${isEditorReadOnly}-${clientId}`;

	const detectedTemplateValue = useMemo(() => {
		// Guard against non-objects or null
		if (typeof localContent !== "object" || localContent === null) {
			return undefined;
		}

		// Guard against object not having 'content' property.
		if (!("content" in localContent)) {
			return undefined;
		}

		const content = (localContent as { content: unknown }).content;

		if (!Array.isArray(content)) {
			return undefined;
		}

		const editorText = extractTextFromTiptapJson(localContent);
		const matchedTemplate = NOTE_TEMPLATES.find((template) =>
			editorText.includes(template.text),
		);
		return matchedTemplate?.value;
	}, [localContent]);

	return (
		<div className="w-full">
			{recordFailures && recordFailures.length > 0 && (
				<div className="mb-4 flex flex-col gap-2">
					{recordFailures.map((failure) => (
						<Alert key={failure.reason} variant="destructive">
							<Info className="h-4 w-4" />
							<AlertTitle>
								{failure.reason.charAt(0).toUpperCase() +
									failure.reason.slice(1)}
							</AlertTitle>
							<AlertDescription>
								First noted {formatShortDate(failure.failedDate)}, last updated{" "}
								{formatShortInstantDate(failure.updatedAt)}.
							</AlertDescription>
							{canResolveFailure && (
								<AlertAction>
									<Button
										disabled={resolveFailure.isPending}
										onClick={() =>
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
			<div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
				<div className="flex flex-wrap items-center gap-3">
					<h4 className="font-bold leading-none">School Records</h4>
					<Select
						disabled={!canEditRecordsNeeded}
						onValueChange={handleNeededChange}
						value={recordsNeeded ?? ""}
					>
						<Tooltip>
							<TooltipTrigger asChild>
								<SelectTrigger id={recordsNeededId}>
									<SelectValue placeholder="Records Needed?" />
								</SelectTrigger>
							</TooltipTrigger>
							{!canEditRecordsNeeded && !readOnly && (
								<TooltipContent>
									<p>{tooltipRecordsNeeded}</p>
								</TooltipContent>
							)}
						</Tooltip>
						<SelectContent>
							<SelectItem value="Not Needed">Not Needed</SelectItem>
							<SelectItem value="Needed">Needed</SelectItem>
						</SelectContent>
					</Select>
					<EvaluationCheckbox clientId={clientId} compact readOnly={readOnly} />
				</div>

				<ResponsiveDialog
					className="max-h-[calc(100vh-4rem)] max-w-2xl overflow-x-hidden overflow-y-scroll sm:max-w-2xl"
					title="Note History"
					trigger={historyTrigger}
				>
					<NoteHistory id={clientId} type="record" />
				</ResponsiveDialog>
			</div>
			{recordsNeeded === "Needed" && (
				<div className="mb-4 space-y-3">
					<div className="grid gap-3 sm:grid-cols-2">
						{requests.map((req, i) => {
							const isSent = !!req.requestedDate;
							return (
								<div
									className="rounded-md border border-border bg-card/50 p-3"
									key={req.id}
								>
									<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
										<Label className="font-semibold">{`Request ${i + 1}`}</Label>
										<span className="text-muted-foreground text-sm">
											Queued {formatShortInstantDate(req.createdAt)}
											{!isSent && ", not yet sent"}
										</span>
										<div className="grow" />
										{!isSent && canAddRequest && (
											<Button
												disabled={cancelRecordRequestMutation.isPending}
												onClick={() => handleCancelRequest(req.id)}
												size="sm"
												variant="outline"
											>
												<X className="h-4 w-4" />
												Cancel request
											</Button>
										)}
									</div>
									<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
										<DatePicker
											allowClear={canAddRequest && isSent}
											date={dateOnlyToLocalDate(req.requestedDate) ?? undefined}
											disabled={!canAddRequest}
											flexDirection="flex-row"
											id={`date-${req.id}`}
											label="Requested"
											placeholder="Pick date"
											setDate={(date) => handleSetRequestDate(req.id, date)}
										/>
										{!isSent && (
											<DatePicker
												allowClear={canAddRequest && !!req.holdUntil}
												date={dateOnlyToLocalDate(req.holdUntil) ?? undefined}
												disabled={!canAddRequest}
												flexDirection="flex-row"
												id={`hold-${req.id}`}
												label="Hold until"
												placeholder="No hold"
												setDate={(date) => handleSetHoldUntil(req.id, date)}
											/>
										)}
									</div>
									{!isSent && (
										<div className="mt-2">
											<Label className="mb-1 block text-muted-foreground text-xs">
												Email request line
											</Label>
											<Textarea
												className="text-sm"
												defaultValue={req.customMessage ?? ""}
												disabled={!canAddRequest}
												onChange={(e) =>
													debouncedSaveMessage(req.id, e.target.value)
												}
												placeholder="Please send the most recent IEP, any Evaluation Reports, and any Reevaluation Review information."
												rows={2}
											/>
										</div>
									)}
								</div>
							);
						})}
					</div>
					{canAddRequest && !requests.some((r) => !r.requestedDate) && (
						<Tooltip>
							<TooltipTrigger asChild>
								<div className="flex items-center gap-2">
									<Checkbox
										checked={false}
										disabled={!canAddRequest}
										id={newRequestId}
										onCheckedChange={(checked) => {
											if (checked) handleFlagRequest();
										}}
									/>
									<Label htmlFor={newRequestId}>Request again?</Label>
								</div>
							</TooltipTrigger>
							{!canAddRequest && !readOnly && (
								<TooltipContent>
									<p>{tooltipAddRequest}</p>
								</TooltipContent>
							)}
						</Tooltip>
					)}
				</div>
			)}
			{isLoading ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-9 w-full rounded-md" />
					<Skeleton className="h-9 w-1/4 rounded-md" />
					<Skeleton className="h-20 w-full rounded-md" key="skeleton-editor" />
				</div>
			) : (
				<div className="space-y-2">
					<Select
						disabled={isEditorReadOnly || !!detectedTemplateValue}
						onValueChange={handleTemplateChange}
						value={detectedTemplateValue ?? ""}
					>
						<SelectTrigger className="w-full sm:w-[240px]" size="sm">
							<SelectValue placeholder="Use a template..." />
						</SelectTrigger>
						<SelectContent>
							{NOTE_TEMPLATES.map((template) => (
								<SelectItem key={template.value} value={template.value}>
									{template.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<RichTextEditor
						formatBar={false}
						key={editorKey}
						onChange={(content) => {
							setLocalContent(content);
							debouncedSaveContent(content);
						}}
						placeholder="Entering data into this box will mark records as received..."
						readonly={isEditorReadOnly}
						value={
							!localContent && isEditorReadOnly
								? "Records summary cannot be added until a request is made."
								: localContent
						}
					/>
				</div>
			)}
		</div>
	);
}
