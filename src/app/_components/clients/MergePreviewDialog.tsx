"use client";

import { Button } from "@ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@ui/dialog";
import { ArrowLeft, ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useMediaQuery } from "~/hooks/use-media-query";
import { api } from "~/trpc/react";
import { Client } from "../client/Client";

interface MergePreviewDialogProps {
	realClient: { id: number; hash: string; fullName: string } | null;
	fakeClient: { id: number; hash: string; fullName: string } | null;
	onSuccess?: () => void;
	shouldRedirect?: boolean;
	children: React.ReactNode;
}

export function MergePreviewDialog({
	realClient,
	fakeClient,
	onSuccess,
	shouldRedirect = false,
	children,
}: MergePreviewDialogProps) {
	const router = useRouter();
	const utils = api.useUtils();
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const [mergeDialogOpen, setMergeDialogOpen] = useState(false);

	const { mutate: replaceNotes, isPending } =
		api.clients.replaceNotes.useMutation({
			onSuccess: (data) => {
				utils.clients.invalidate();
				toast.success("Merged successfully!", {
					description: String(data.message),
				});
				setMergeDialogOpen(false);
				onSuccess?.();

				if (shouldRedirect && realClient?.hash) {
					router.push(`/clients/${realClient.hash}`);
				}
			},
			onError: (error) => {
				toast.error("Failed to replace notes", {
					description: String(error.message),
					duration: 10000,
				});
			},
		});

	return (
		<Dialog onOpenChange={setMergeDialogOpen} open={mergeDialogOpen}>
			<DialogTrigger asChild disabled={!realClient || !fakeClient}>
				{children}
			</DialogTrigger>
			<DialogContent className="max-h-[calc(100vh-4rem)] max-w-fit overflow-x-hidden overflow-y-scroll sm:max-w-fit">
				<DialogTitle>Preview Merge</DialogTitle>
				<div className="flex w-full min-w-[calc(100vw-5rem)] flex-col justify-between gap-10 md:flex-row lg:min-w-5xl">
					<Client hash={realClient?.hash ?? ""} readOnly />
					<div className="flex flex-col items-center gap-4">
						<Button
							disabled={!realClient || !fakeClient || isPending}
							onClick={() =>
								realClient &&
								fakeClient &&
								replaceNotes({
									clientId: realClient.id,
									fakeClientId: fakeClient.id,
								})
							}
						>
							<ArrowLeft className="hidden sm:block" />
							<ArrowUp className="sm:hidden" />
							{isPending ? "Merging..." : "Append Notes & Delete Fake"}
						</Button>
						<div className="flex flex-col items-center gap-4">
							<p className="max-w-[20ch] text-muted-foreground text-sm">
								Notes from the client on the
								{isDesktop ? " right " : " bottom "}
								will be added to the end of the notes of the client on the
								{isDesktop ? " left" : " top"}.
							</p>
							<p className="max-w-[20ch] text-muted-foreground text-sm">
								The title of the notes on the
								{isDesktop ? " right " : " bottom "}
								will replace the title of the notes on the
								{isDesktop ? " left" : " top"}.
							</p>
						</div>
					</div>
					<Client hash={fakeClient?.hash ?? ""} readOnly />
				</div>
			</DialogContent>
		</Dialog>
	);
}
