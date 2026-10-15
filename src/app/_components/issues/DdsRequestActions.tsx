"use client";

import { Button } from "@ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { useState } from "react";
import { toast } from "sonner";
import type { ClientWithIssueInfo } from "~/lib/models";
import { api } from "~/trpc/react";
import { ResponsiveDialog } from "../shared/ResponsiveDialog";

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
				<p className="text-muted-foreground text-sm">Loading PDFs...</p>
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
				<p className="text-muted-foreground text-sm italic">
					No PDFs found in this client's Drive folder.
				</p>
			)}
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
	const requestId = client.ddsRequestId;
	const decide = api.ddsQueue.decide.useMutation({
		onSuccess: () => utils.clients.getDdsRequests.invalidate(),
		onError: (error) => toast.error(error.message),
	});
	if (requestId === undefined) return null;

	return (
		<div className="flex gap-1">
			<Button
				disabled={decide.isPending}
				onClick={() => decide.mutate({ id: requestId, status: "approved" })}
				size="sm"
				variant="outline"
			>
				Approve
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
