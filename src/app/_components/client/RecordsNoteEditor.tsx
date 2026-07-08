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
import { History, Info } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { NOTE_TEMPLATES } from "~/lib/constants";
import { logger } from "~/lib/logger";
import { formatShortDate, getLocalDayFromUTCDate } from "~/lib/utils";
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
			enabled: !!clientId,
		});

	const { data: allFailures } = api.clients.getFailures.useQuery(clientId, {
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
			{ enabled: !!clientId },
		);

	// States
	const [recordsNeeded, setRecordsNeeded] = useState<
		"Needed" | "Not Needed" | undefined
	>();
	const [requests, setRequests] = useState<
		Array<{
			id: number;
			clientId: number;
			requestedDate: Date | string | null;
			holdUntil: Date | string | null;
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

	const setRecordRequestDateMutation =
		api.externalRecords.setRecordRequestDate.useMutation({
			onSuccess: () => {
				utils.externalRecords.getExternalRecordByClientId.invalidate(clientId);
			},
			onError: (error) => handleError(error, "set record request date"),
		});

	const removeRecordRequestMutation =
		api.externalRecords.removeRecordRequest.useMutation({
			onSuccess: () => {
				utils.externalRecords.getExternalRecordByClientId.invalidate(clientId);
			},
			onError: (error) => handleError(error, "remove record request"),
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

	const handleSetRequestDate = (requestId: number, date: Date | undefined) => {
		if (!clientId) return;
		setRecordRequestDateMutation.mutate({
			requestId,
			clientId,
			requestedDate: date ?? null,
		});
	};

	const handleRemoveRequest = (requestId: number) => {
		if (!clientId) return;
		removeRecordRequestMutation.mutate({ clientId, requestId });
	};

	const handleSetHoldUntil = (requestId: number, date: Date | undefined) => {
		if (!clientId) return;
		setRecordRequestHoldUntilMutation.mutate({
			requestId,
			clientId,
			holdUntil: date ?? null,
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
								{formatShortDate(failure.updatedAt)}.
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
					<Tooltip>
						<TooltipTrigger>
							<Select
								disabled={!canEditRecordsNeeded}
								onValueChange={handleNeededChange}
								value={recordsNeeded ?? ""}
							>
								<SelectTrigger id={recordsNeededId}>
									<SelectValue placeholder="Records Needed?" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="Not Needed">Not Needed</SelectItem>
									<SelectItem value="Needed">Needed</SelectItem>
								</SelectContent>
							</Select>
						</TooltipTrigger>
						{!canEditRecordsNeeded && !readOnly && (
							<TooltipContent>
								<p>{tooltipRecordsNeeded}</p>
							</TooltipContent>
						)}
					</Tooltip>
					<EvaluationCheckbox clientId={clientId} compact readOnly={readOnly} />
					{recordsNeeded === "Needed" &&
						requests.map((req, i) => {
							const hasSentDate = !!req.requestedDate;
							const checkboxId = `flag-${req.id}`;
							const dateId = `date-${req.id}`;
							return (
								<div className="flex flex-wrap items-center gap-2" key={req.id}>
									<div className="flex items-center gap-2">
										<Checkbox
											checked={true}
											disabled={hasSentDate || !canAddRequest}
											id={checkboxId}
											onCheckedChange={(checked) => {
												if (!checked) handleRemoveRequest(req.id);
											}}
										/>
										<Label htmlFor={checkboxId}>
											{i === 0 ? "Request?" : "Request Again?"}
										</Label>
									</div>
									<DatePicker
										allowClear={canAddRequest && hasSentDate}
										date={
											getLocalDayFromUTCDate(req.requestedDate) ?? undefined
										}
										disabled={!canAddRequest}
										flexDirection="flex-row"
										id={dateId}
										label={i === 0 ? "Requested" : `Requested (${i + 1})`}
										placeholder="Pick date"
										setDate={(date) => handleSetRequestDate(req.id, date)}
									/>
									{!req.requestedDate && (
										<DatePicker
											allowClear={canAddRequest && !!req.holdUntil}
											date={getLocalDayFromUTCDate(req.holdUntil) ?? undefined}
											disabled={!canAddRequest}
											flexDirection="flex-row"
											id={`hold-${req.id}`}
											label="Hold until"
											placeholder="No hold"
											setDate={(date) => handleSetHoldUntil(req.id, date)}
										/>
									)}
								</div>
							);
						})}
					{recordsNeeded === "Needed" &&
						requests
							.filter((r) => !r.requestedDate)
							.map((req) => (
								<div className="w-full space-y-2" key={`msg-${req.id}`}>
									<div>
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
								</div>
							))}
					{canAddRequest &&
						requests.length > 0 &&
						!requests.some((r) => !r.requestedDate) && (
							<Tooltip>
								<TooltipTrigger>
									<div className="flex items-center gap-2">
										<Checkbox
											checked={false}
											disabled={!canAddRequest}
											id={newRequestId}
											onCheckedChange={(checked) => {
												if (checked) handleFlagRequest();
											}}
										/>
										<Label htmlFor={newRequestId}>Request Again?</Label>
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

				<div className="flex flex-row items-center gap-3">
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

					<ResponsiveDialog
						className="max-h-[calc(100vh-4rem)] max-w-fit overflow-x-hidden overflow-y-scroll sm:max-w-fit"
						title="Note History"
						trigger={historyTrigger}
					>
						<NoteHistory id={clientId} type="record" />
					</ResponsiveDialog>
				</div>
			</div>
			{isLoading ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-9 w-full rounded-md" />
					<Skeleton className="h-9 w-1/4 rounded-md" />
					<Skeleton className="h-20 w-full rounded-md" key="skeleton-editor" />
				</div>
			) : (
				<div>
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
