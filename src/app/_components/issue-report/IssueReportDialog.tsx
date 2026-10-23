"use client";

import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/dialog";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import {
	ScreenshotEditor,
	type ScreenshotEditorHandle,
} from "./ScreenshotEditor";

interface IssueReportDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	pageUrl: string;
	screenshot: string | null;
}

export function IssueReportDialog({
	open,
	onOpenChange,
	pageUrl,
	screenshot,
}: IssueReportDialogProps) {
	const editorRef = useRef<ScreenshotEditorHandle | null>(null);
	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");
	const [ccEmails, setCcEmails] = useState<string[]>([]);
	const { data: recipientConfig } = api.issueReport.getRecipients.useQuery(
		undefined,
		{ enabled: open },
	);

	const send = api.issueReport.send.useMutation({
		onSuccess: () => {
			toast.success("Report sent");
			setSubject("");
			setBody("");
			setCcEmails([]);
			onOpenChange(false);
		},
		onError: (error) => {
			toast.error("Failed to send report", { description: error.message });
		},
	});

	const toggleRecipient = (email: string, checked: boolean) => {
		setCcEmails((current) =>
			checked ? [...current, email] : current.filter((e) => e !== email),
		);
	};

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		send.mutate({
			subject,
			body,
			pageUrl,
			ccEmails,
			screenshotBase64: editorRef.current?.toPngBase64() ?? undefined,
		});
	};

	const recipients = recipientConfig?.recipients ?? [];

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-3xl">
				<form className="grid gap-4" onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Report an issue</DialogTitle>
						<DialogDescription>
							Mark up the screenshot to point out the problem, then describe
							what happened.
						</DialogDescription>
					</DialogHeader>

					{screenshot && (
						<ScreenshotEditor
							imageSrc={screenshot}
							onReady={(handle) => {
								editorRef.current = handle;
							}}
						/>
					)}

					<div className="grid gap-2">
						<Label htmlFor="issue-subject">Subject</Label>
						<Input
							id="issue-subject"
							maxLength={200}
							onChange={(e) => setSubject(e.target.value)}
							required
							value={subject}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="issue-body">Message</Label>
						<Textarea
							id="issue-body"
							maxLength={5000}
							onChange={(e) => setBody(e.target.value)}
							required
							rows={5}
							value={body}
						/>
					</div>

					{recipients.length > 0 && (
						<fieldset className="grid gap-2">
							<legend className="font-medium text-sm">Include on email</legend>
							<div className="flex flex-wrap gap-x-4 gap-y-2">
								{recipients.map((recipient) => (
									<Label
										className="flex items-center gap-2 font-normal"
										key={recipient.email}
									>
										<Checkbox
											checked={ccEmails.includes(recipient.email)}
											onCheckedChange={(checked) =>
												toggleRecipient(recipient.email, checked === true)
											}
										/>
										{recipient.name}
									</Label>
								))}
							</div>
						</fieldset>
					)}

					<DialogFooter>
						<Button
							onClick={() => onOpenChange(false)}
							type="button"
							variant="outline"
						>
							Cancel
						</Button>
						<Button disabled={send.isPending} type="submit">
							{send.isPending ? "Sending..." : "Send"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
