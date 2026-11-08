"use client";

import { ResponsiveDialog } from "@components/shared/ResponsiveDialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ClientWithIssueInfo } from "~/lib/models";
import { api } from "~/trpc/react";

/**
 * The completed fax PDF for a request, cached per selected file so the review
 * dialog opens instantly once the row has prefetched it. A failed build throws
 * the service's error message.
 */
const ddsPreviewQuery = (
	requestId: number,
	fileId: string | null | undefined,
) => ({
	queryKey: ["dds-preview", requestId, fileId],
	staleTime: 10 * 60 * 1000,
	queryFn: async () => {
		const res = await fetch(`/api/dds-preview/${requestId}`);
		if (!res.ok) throw new Error(await res.text());
		return res.blob();
	},
});

export const DDS_REQUESTS_DESCRIPTION =
	"Disability Determination Services faxes asking for a psychological evaluation. Each row shows the PDF found in the client's Drive folder. Change it if it is the wrong file, then approve or deny.";

function ChangePdfDialog({
	client,
	requestId,
	onClose,
}: {
	client: ClientWithIssueInfo;
	requestId: number;
	onClose: () => void;
}) {
	const utils = api.useUtils();
	const pdfs = api.ddsQueue.listClientPdfs.useQuery({ clientId: client.id });
	const setFile = api.ddsQueue.setFile.useMutation({
		onSuccess: async () => {
			await utils.clients.getDdsRequests.invalidate();
			onClose();
		},
		onError: (error) => toast.error(error.message),
	});

	return (
		<ResponsiveDialog
			open
			setOpen={(open) => !open && onClose()}
			title="Choose a different PDF"
		>
			{pdfs.isLoading ? (
				<p className="text-sm text-muted-foreground">Loading PDFs...</p>
			) : pdfs.data?.length ? (
				<Select
					disabled={setFile.isPending}
					onValueChange={(fileId) => {
						const file = pdfs.data?.find((pdf) => pdf.id === fileId);
						if (file) {
							setFile.mutate({
								id: requestId,
								fileId: file.id,
								fileName: file.name,
							});
						}
					}}
				>
					<SelectTrigger>
						<SelectValue placeholder="Select a PDF (newest first)" />
					</SelectTrigger>
					<SelectContent>
						{pdfs.data.map((pdf) => (
							<SelectItem key={pdf.id} value={pdf.id}>
								{pdf.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			) : (
				<p className="text-sm text-muted-foreground italic">
					No PDFs found in this client's Drive folder.
				</p>
			)}
		</ResponsiveDialog>
	);
}

function ApproveDialog({
	requestId,
	fileId,
	onClose,
	onChangePdf,
}: {
	requestId: number;
	fileId: string | null | undefined;
	onClose: () => void;
	onChangePdf: () => void;
}) {
	const utils = api.useUtils();
	const preview = useQuery(ddsPreviewQuery(requestId, fileId));
	const approve = api.ddsQueue.decide.useMutation({
		onSuccess: async () => {
			await utils.clients.getDdsRequests.invalidate();
			onClose();
		},
		onError: (error) => toast.error(error.message),
	});

	// A failed build would render the error body inside the iframe, so the PDF
	// is only embedded once the query has a good blob.
	const [pdfUrl, setPdfUrl] = useState<string>();
	useEffect(() => {
		if (!preview.data) return;
		const objectUrl = URL.createObjectURL(preview.data);
		setPdfUrl(objectUrl);
		return () => URL.revokeObjectURL(objectUrl);
	}, [preview.data]);

	return (
		<ResponsiveDialog
			className="sm:max-w-5xl"
			open
			setOpen={(open) => !open && onClose()}
			title="Review the fax before sending"
		>
			<div className="flex flex-col gap-3">
				{preview.error ? (
					<div className="flex flex-col items-start gap-2">
						<p className="text-sm text-destructive">{preview.error.message}</p>
						<Button onClick={onChangePdf} size="sm" variant="outline">
							Choose a PDF
						</Button>
					</div>
				) : pdfUrl ? (
					<iframe
						className="h-[80vh] w-full rounded border"
						src={pdfUrl}
						title="Completed DDS fax"
					/>
				) : (
					<p className="text-sm text-muted-foreground">Building the fax...</p>
				)}
				<div className="flex justify-end gap-2">
					<Button onClick={onClose} variant="ghost">
						Cancel
					</Button>
					<Button
						disabled={!pdfUrl || approve.isPending}
						onClick={() =>
							approve.mutate({ id: requestId, status: "approved" })
						}
					>
						Approve and send
					</Button>
				</div>
			</div>
		</ResponsiveDialog>
	);
}

export const DdsRequestActions = ({
	client,
}: {
	client: ClientWithIssueInfo;
}) => {
	const utils = api.useUtils();
	const [changing, setChanging] = useState(false);
	const [reviewing, setReviewing] = useState(false);
	const requestId = client.ddsRequestId;
	const fileId = client.ddsFileId;
	const queryClient = useQueryClient();
	// Build the fax in the background once a file is selected so the review
	// dialog doesn't wait on the sidecar.
	useEffect(() => {
		if (requestId !== undefined && fileId) {
			void queryClient.prefetchQuery(ddsPreviewQuery(requestId, fileId));
		}
	}, [queryClient, requestId, fileId]);
	const decide = api.ddsQueue.decide.useMutation({
		onSuccess: () => utils.clients.getDdsRequests.invalidate(),
		onError: (error) => toast.error(error.message),
	});
	if (requestId === undefined) return null;

	return (
		<div className="flex flex-wrap gap-1">
			<Button onClick={() => setReviewing(true)} size="sm" variant="outline">
				Review and approve
			</Button>
			<Button
				disabled={decide.isPending}
				onClick={() => decide.mutate({ id: requestId, status: "denied" })}
				size="sm"
				variant="ghost"
			>
				Deny
			</Button>
			<Button onClick={() => setChanging(true)} size="sm" variant="ghost">
				Change PDF
			</Button>
			{reviewing && (
				<ApproveDialog
					fileId={fileId}
					onChangePdf={() => {
						setReviewing(false);
						setChanging(true);
					}}
					onClose={() => setReviewing(false)}
					requestId={requestId}
				/>
			)}
			{changing && (
				<ChangePdfDialog
					client={client}
					onClose={() => setChanging(false)}
					requestId={requestId}
				/>
			)}
		</div>
	);
};
