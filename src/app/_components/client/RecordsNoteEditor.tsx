import { RichTextEditor } from "@components/shared/RichTextEditor";
import type { CheckedState } from "@radix-ui/react-checkbox";
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
import { Separator } from "@ui/separator";
import { Skeleton } from "@ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { debounce, isEqual } from "lodash";
import { History } from "lucide-react";
import { useSession } from "next-auth/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { logger } from "~/lib/logger";
import { getLocalDayFromUTCDate, hasPermission } from "~/lib/utils";
import { api } from "~/trpc/react";
import { NoteHistory } from "../shared/NoteHistory";
import { ResponsiveDialog } from "../shared/ResponsiveDialog";

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

const noteTemplates = [
	{
		value: "district-dx",
		label: "District - DX",
		text: "Testing has been done by the school district and a diagnosis has been given.",
	},
	{
		value: "district-no-dx",
		label: "District - No DX",
		text: "Testing has been done by the school district and no diagnosis has been given.",
	},
	{
		value: "outside-dx",
		label: "Outside - DX",
		text: "Testing has been done by an outside medical provider and a diagnosis has been given.",
	},
	{
		value: "outside-no-dx",
		label: "Outside - No DX",
		text: "Testing has been done by an outside medical provider and no diagnosis has been given.",
	},
];

interface RecordsNoteEditorProps {
	clientId: number;
	readOnly?: boolean;
}

export function RecordsNoteEditor({
	clientId,
	readOnly = false,
}: RecordsNoteEditorProps) {
	const { data: session } = useSession();
	const utils = api.useUtils();

	const canRecordsNeeded = session
		? hasPermission(session.user.permissions, "clients:records:needed")
		: false;
	const canRecordNote = session
		? hasPermission(session.user.permissions, "clients:records:create")
		: false;

	const { data: record, isLoading: isLoadingRecord } =
		api.externalRecords.getExternalRecordByClientId.useQuery(clientId, {
			enabled: !!clientId,
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
			utils.externalRecords.getExternalRecordByClientId.setData(
				clientId,
				(oldData) => {
					if (!oldData) {
						return updatedExternalRecordsNote;
					}
					return {
						...oldData,
						...updatedExternalRecordsNote,
					};
				},
			);
		},
	});

	// Fetch Client for the "recordsNeeded" checkbox
	const { data: client, isLoading: isLoadingClient } =
		api.clients.getOne.useQuery(
			{
				column: "id",
				value: clientId.toString(),
			},
			{ enabled: !!clientId },
		);

	// States
	const [recordsNeeded, setRecordsNeeded] = useState(false);
	const [firstRequestedDate, setFirstRequestedDate] = useState<
		Date | undefined
	>();
	const [needsSecondRequest, setNeedsSecondRequest] = useState(false);
	const [secondRequestDate, setSecondRequestDate] = useState<
		Date | undefined
	>();
	const [localContent, setLocalContent] = useState(record?.contentJson ?? "");

	useEffect(() => {
		setRecordsNeeded(client?.recordsNeeded ?? false);
	}, [client?.recordsNeeded]);

	useEffect(() => {
		setFirstRequestedDate(
			getLocalDayFromUTCDate(record?.requested) ?? undefined,
		);
		setNeedsSecondRequest(record?.needsSecondRequest ?? false);
		setSecondRequestDate(
			getLocalDayFromUTCDate(record?.secondRequestDate) ?? undefined,
		);
	}, [
		record?.requested,
		record?.needsSecondRequest,
		record?.secondRequestDate,
	]);

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

	const setFirstRequestDateMutation =
		api.externalRecords.setFirstRequestDate.useMutation({
			onSuccess: () => {
				utils.externalRecords.getExternalRecordByClientId.invalidate(clientId);
			},
			onError: (error) => handleError(error, "set first requested date"),
		});

	const setNeedsSecondRequestMutation =
		api.externalRecords.setNeedsSecondRequest.useMutation({
			onSuccess: () => {
				utils.externalRecords.getExternalRecordByClientId.invalidate(clientId);
			},
			onError: (error) => handleError(error, "set second request flag"),
		});

	const setSecondRequestDateMutation =
		api.externalRecords.setSecondRequestDate.useMutation({
			onSuccess: () => {
				utils.externalRecords.getExternalRecordByClientId.invalidate(clientId);
			},
			onError: (error) => handleError(error, "set second requested date"),
		});

	const stateRef = useRef({
		record,
		updateNoteMutation,
		createNoteMutation,
		clientId,
	});

	useEffect(() => {
		stateRef.current = {
			record,
			updateNoteMutation,
			createNoteMutation,
			clientId,
		};
	});

	const debouncedSaveContent = useMemo(
		() =>
			debounce((editorContent: object) => {
				const { record, updateNoteMutation, createNoteMutation, clientId } =
					stateRef.current;
				if (!clientId) return;

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

	const handleNeededChange = (checked: CheckedState) => {
		const newCheckedState = checked === "indeterminate" ? false : checked;

		setRecordsNeeded(newCheckedState);

		if (!clientId) return;

		updateClientMutation.mutate({
			clientId: clientId,
			recordsNeeded: newCheckedState,
		});
	};

	const handleFirstRequestedDateChange = (date: Date | undefined) => {
		setFirstRequestedDate(date);

		if (!clientId) {
			return;
		}

		setFirstRequestDateMutation.mutate({
			clientId: clientId,
			requested: date ?? null,
		});
	};

	const handleNeedsSecondRequestChange = (checked: CheckedState) => {
		const newCheckedState = checked === "indeterminate" ? false : checked;

		setNeedsSecondRequest(newCheckedState);

		if (!clientId) return;

		if (record?.clientId) {
			setNeedsSecondRequestMutation.mutate({
				clientId: clientId,
				needsSecondRequest: newCheckedState,
			});
		} else {
			toast.error("Error", {
				description:
					"A first request date must be set before flagging for a second request.",
			});
		}
	};

	const handleSecondRequestedDateChange = (date: Date | undefined) => {
		setSecondRequestDate(date);

		if (!clientId) {
			return;
		}

		setSecondRequestDateMutation.mutate({
			clientId: clientId,
			secondRequestDate: date ?? null,
		});
	};

	const handleTemplateChange = (value: string) => {
		const template = noteTemplates.find((t) => t.value === value);
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
	const canEditRecordsNeeded =
		canRecordsNeeded && !readOnly && !firstRequestedDate;
	const canEditFirstDate = canRecordNote && !readOnly && recordsNeeded;
	const canEditSecondNeeded =
		canRecordNote &&
		!readOnly &&
		recordsNeeded &&
		!!firstRequestedDate &&
		!secondRequestDate;
	const canEditSecondDate = canRecordNote && !readOnly && needsSecondRequest;

	// Text Editor is editable if records are needed, a request was made, and not read-only
	const isEditorReadOnly =
		!canRecordNote || readOnly || !recordsNeeded || !firstRequestedDate;

	const tooltipRecordsNeeded = firstRequestedDate
		? "The request date is already set."
		: !canRecordNote && "Missing permissions.";

	const tooltipFirstDate = !recordsNeeded
		? "The 'Needed' flag must be set first."
		: !canRecordNote && "Missing permissions.";

	const tooltipSecondNeeded = !firstRequestedDate
		? "The first request date must be set before requesting again."
		: secondRequestDate
			? "The second request date is already set."
			: !canRecordNote && "Missing permissions .";

	const tooltipSecondDate = !needsSecondRequest
		? "The 'Second Request?' flag must be checked first."
		: !canRecordNote && "Missing permissions.";

	const recordsNeededId = useId();
	const firstRequestedId = useId();
	const secondNeededId = useId();
	const secondRequestedId = useId();

	const editorKey = `${isEditorReadOnly}-${clientId}`;

	const isTemplateUsed = useMemo(() => {
		// Guard against non-objects or null
		if (typeof localContent !== "object" || localContent === null) {
			return false;
		}

		// Guard against object not having 'content' property.
		if (!("content" in localContent)) {
			return false;
		}

		const content = (localContent as { content: unknown }).content;

		if (!Array.isArray(content)) {
			return false;
		}

		const editorText = extractTextFromTiptapJson(localContent);
		return noteTemplates.some((template) => editorText.includes(template.text));
	}, [localContent]);

	return (
		<div className="w-full">
			<div className="mb-4 flex h-[16px] flex-row items-center justify-between gap-3">
				<div className="flex h-[16px] flex-row items-center gap-3">
					<h4 className="font-bold leading-none">School Records</h4>
					<Tooltip>
						<TooltipTrigger>
							<div className="flex items-center gap-2">
								<Checkbox
									checked={recordsNeeded}
									disabled={!canEditRecordsNeeded}
									id={recordsNeededId}
									onCheckedChange={handleNeededChange}
								/>
								<Label htmlFor={recordsNeededId}>Needed</Label>
							</div>
						</TooltipTrigger>
						{!canEditRecordsNeeded && !readOnly && (
							<TooltipContent>
								<p>{tooltipRecordsNeeded}</p>
							</TooltipContent>
						)}
					</Tooltip>
					<Separator orientation="vertical" />
					<Tooltip>
						<TooltipTrigger>
							<DatePicker
								allowClear={canEditFirstDate && !!firstRequestedDate}
								date={firstRequestedDate}
								disabled={!canEditFirstDate}
								flexDirection="flex-row"
								id={firstRequestedId}
								label="Requested"
								placeholder="Pick date"
								setDate={handleFirstRequestedDateChange}
							/>
						</TooltipTrigger>
						{!canEditFirstDate && !readOnly && (
							<TooltipContent>
								<p>{tooltipFirstDate}</p>
							</TooltipContent>
						)}
					</Tooltip>
					{!!firstRequestedDate && (
						<>
							<Separator orientation="vertical" />
							<Tooltip>
								<TooltipTrigger>
									<div className="flex items-center gap-2">
										<Checkbox
											checked={needsSecondRequest}
											disabled={!canEditSecondNeeded}
											id={secondNeededId}
											onCheckedChange={handleNeedsSecondRequestChange}
										/>
										<Label htmlFor={secondNeededId}>Request Again?</Label>
									</div>
								</TooltipTrigger>
								{!canEditSecondNeeded && !readOnly && (
									<TooltipContent>
										<p>{tooltipSecondNeeded}</p>
									</TooltipContent>
								)}
							</Tooltip>
						</>
					)}
					{(needsSecondRequest || !!secondRequestDate) && (
						<>
							<Separator orientation="vertical" />
							<Tooltip>
								<TooltipTrigger>
									<DatePicker
										allowClear={canEditSecondDate && !!secondRequestDate}
										date={secondRequestDate}
										disabled={!canEditSecondDate}
										flexDirection="flex-row"
										id={secondRequestedId}
										label="Requested (2nd)"
										placeholder="Pick date"
										setDate={handleSecondRequestedDateChange}
									/>
								</TooltipTrigger>
								{!canEditSecondDate && !readOnly && (
									<TooltipContent>
										<p>{tooltipSecondDate}</p>
									</TooltipContent>
								)}
							</Tooltip>
						</>
					)}
				</div>

				<div className="flex flex-row items-center gap-3">
					<Select
						disabled={isEditorReadOnly || isTemplateUsed}
						onValueChange={handleTemplateChange}
					>
						<SelectTrigger className="w-[240px]" size="sm">
							<SelectValue placeholder="Use a template..." />
						</SelectTrigger>
						<SelectContent>
							{noteTemplates.map((template) => (
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
