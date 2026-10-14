"use client";

import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Skeleton } from "@ui/skeleton";
import { Textarea } from "@ui/textarea";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { MAX_POST_VISIT_ATTACHMENT_BYTES } from "~/lib/constants";
import { api } from "~/trpc/react";

function toBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () =>
			resolve((reader.result as string).split(",")[1] ?? "");
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}

export default function PostVisitAttachmentSettings() {
	const utils = api.useUtils();
	const inputRef = useRef<HTMLInputElement>(null);
	const { data, isLoading } = api.postVisitAttachment.get.useQuery();

	const setAttachment = api.postVisitAttachment.set.useMutation({
		onSuccess: () => {
			toast.success("Attachment updated");
			utils.postVisitAttachment.get.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to update attachment", {
				description: error.message,
			});
		},
	});

	const handleFile = async (file: File | undefined) => {
		if (!file) return;
		if (file.size > MAX_POST_VISIT_ATTACHMENT_BYTES) {
			toast.error(
				`File is too large (max ${MAX_POST_VISIT_ATTACHMENT_BYTES / 1024 / 1024} MB)`,
			);
			return;
		}
		setAttachment.mutate({ base64: await toBase64(file) });
	};

	return (
		<div className="space-y-4">
			<MessageTextCard />
			<Card>
				<CardContent className="space-y-3">
					<h3 className="font-semibold text-sm">
						Post-Visit Message Attachment
					</h3>
					<p className="text-muted-foreground text-sm">
						This PDF is attached to every post-visit message sent through
						TherapyAppointment.
					</p>
					{isLoading ? (
						<Skeleton className="h-4 w-48" />
					) : (
						<p className="text-sm">
							{data?.updatedAt
								? `Last updated ${new Date(data.updatedAt * 1000).toLocaleString()}`
								: "No attachment uploaded yet"}
						</p>
					)}
					<input
						accept="application/pdf"
						className="hidden"
						onChange={(e) => {
							handleFile(e.target.files?.[0]);
							e.target.value = "";
						}}
						ref={inputRef}
						type="file"
					/>
					<Button
						disabled={setAttachment.isPending}
						onClick={() => inputRef.current?.click()}
						variant="outline"
					>
						{data?.updatedAt ? "Replace PDF" : "Upload PDF"}
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}

function MessageTextCard() {
	const utils = api.useUtils();
	const { data, isLoading } = api.postVisitAttachment.getMessage.useQuery();
	const [subject, setSubject] = useState<string>();
	const [body, setBody] = useState<string>();

	const setMessage = api.postVisitAttachment.setMessage.useMutation({
		onSuccess: () => {
			toast.success("Message updated");
			utils.postVisitAttachment.getMessage.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to update message", { description: error.message });
		},
	});

	const subjectValue = subject ?? data?.subject ?? "";
	const bodyValue = body ?? data?.body ?? "";

	return (
		<Card>
			<CardContent className="space-y-3">
				<h3 className="font-semibold text-sm">Post-Visit Message Text</h3>
				<p className="text-muted-foreground text-sm">
					The subject and message sent with the attachment. Changes apply to
					messages sent from now on, including ones already queued.
				</p>
				{isLoading ? (
					<Skeleton className="h-24 w-full" />
				) : (
					<>
						<div className="space-y-1">
							<Label htmlFor="post-visit-subject">Subject</Label>
							<Input
								id="post-visit-subject"
								maxLength={200}
								onChange={(e) => setSubject(e.target.value)}
								value={subjectValue}
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="post-visit-body">Message</Label>
							<Textarea
								id="post-visit-body"
								maxLength={5000}
								onChange={(e) => setBody(e.target.value)}
								value={bodyValue}
							/>
						</div>
						<Button
							disabled={
								setMessage.isPending ||
								!subjectValue.trim() ||
								!bodyValue.trim()
							}
							onClick={() =>
								setMessage.mutate({ subject: subjectValue, body: bodyValue })
							}
						>
							Save
						</Button>
					</>
				)}
			</CardContent>
		</Card>
	);
}
