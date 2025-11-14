import { RichTextEditor } from "@components/shared/RichTextEditor";
import type { CheckedState } from "@radix-ui/react-checkbox";
import { Checkbox } from "@ui/checkbox";
import { DatePicker } from "@ui/date-picker";
import { Label } from "@ui/label";
import { Separator } from "@ui/separator";
import { Skeleton } from "@ui/skeleton";
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

	const { data: client, isLoading: isLoadingClient } =
		api.clients.getOne.useQuery(
			{
				column: "id",
				value: clientId.toString(),
			},
			{ enabled: !!clientId },
		);

	const [recordsNeeded, setRecordsNeeded] = useState(false);
	const [requestedDate, setRequestedDate] = useState<Date | undefined>(
		getLocalDayFromUTCDate(record?.requested) ?? undefined,
	);

	useEffect(() => {
		setRecordsNeeded(client?.recordsNeeded ?? false);
	}, [client?.recordsNeeded]);

	useEffect(() => {
		setRequestedDate(getLocalDayFromUTCDate(record?.requested) ?? undefined);
	}, [record?.requested]);

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

	const setRequestedDateMutation =
		api.externalRecords.setRequestedDate.useMutation({
			onSuccess: () => {
				utils.externalRecords.getExternalRecordByClientId.invalidate(clientId);
			},
			onError: (error) => handleError(error, "set requested date"),
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

	const handleRequestedDateChange = (date: Date | undefined) => {
		setRequestedDate(date);

		if (!clientId || !date) return;

		setRequestedDateMutation.mutate({
			clientId: clientId,
			requested: date,
		});
	};

	const isLoading = isLoadingRecord || isLoadingClient;
	const isReadOnly =
		!canRecordNote || readOnly || !recordsNeeded || !requestedDate;
	const isNeedeedReadOnly = !canRecordsNeeded || readOnly;

	const recordsNeededId = useId();
	const recordsRequestedId = useId();

	const editorKey = `${isReadOnly}-${clientId}`;

	return (
		<div className="w-full">
			<div className="mb-4 flex h-[16px] flex-row items-center gap-3">
				<h4 className="font-bold leading-none">Records</h4>
				<div className="flex items-center gap-2">
					<Checkbox
						checked={recordsNeeded}
						disabled={isNeedeedReadOnly}
						id={recordsNeededId}
						onCheckedChange={handleNeededChange}
					/>
					<Label htmlFor={recordsNeededId}>Needed</Label>
				</div>
				<Separator orientation="vertical" />
				<DatePicker
					date={requestedDate}
					disabled={isReadOnly || !recordsNeeded}
					flexDirection="flex-row"
					id={recordsRequestedId}
					label="Requested"
					placeholder="Pick date"
					setDate={handleRequestedDateChange}
				/>
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
						readonly={isReadOnly}
						value={record?.contentJson ?? ""}
					/>
				</div>
			)}
		</div>
	);
}
