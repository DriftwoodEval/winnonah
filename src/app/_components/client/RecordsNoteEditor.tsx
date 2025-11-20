import { RichTextEditor } from "@components/shared/RichTextEditor";
import type { CheckedState } from "@radix-ui/react-checkbox";
import { Checkbox } from "@ui/checkbox";
import { DatePicker } from "@ui/date-picker";
import { Label } from "@ui/label";
import { Separator } from "@ui/separator";
import { Skeleton } from "@ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { debounce } from "lodash";
import { useSession } from "next-auth/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { logger } from "~/lib/logger";
import { getLocalDayFromUTCDate, hasPermission } from "~/lib/utils";
import { api } from "~/trpc/react";

const log = logger.child({ module: "RecordsNoteEditor" });

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
			refetchInterval: 10000, // 10 seconds
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
	>(getLocalDayFromUTCDate(record?.requested) ?? undefined);
	const [needsSecondRequest, setNeedsSecondRequest] = useState(false);
	const [secondRequestDate, setSecondRequestDate] = useState<Date | undefined>(
		getLocalDayFromUTCDate(record?.secondRequestDate) ?? undefined,
	);

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

	return (
		<div className="w-full">
			<div className="mb-4 flex h-[16px] flex-row items-center gap-3">
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
					{!canEditRecordsNeeded && (
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
					{!canEditFirstDate && (
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
							{!canEditSecondNeeded && (
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
							{!canEditSecondDate && (
								<TooltipContent>
									<p>{tooltipSecondDate}</p>
								</TooltipContent>
							)}
						</Tooltip>
					</>
				)}
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
						onChange={debouncedSaveContent}
						placeholder="Entering data into this box will mark records as received..."
						readonly={isEditorReadOnly}
						value={
							!record?.contentJson && isEditorReadOnly
								? "Records summary cannot be added until a request is made."
								: (record?.contentJson ?? "")
						}
					/>
				</div>
			)}
		</div>
	);
}
