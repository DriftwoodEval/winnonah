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
import { ImagePlus, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "~/lib/utils";
import { MAX_ISSUE_REPORT_SCREENSHOTS } from "~/lib/validations/config";
import { api } from "~/trpc/react";
import {
	type DraftImage,
	renderMarkedUpJpeg,
	ScreenshotEditor,
	type Shape,
} from "./ScreenshotEditor";

export interface IssueReportForm {
	subject: string;
	body: string;
	ccEmails: string[];
}

interface IssueReportDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	images: DraftImage[];
	selectedId: string | null;
	onSelect: (id: string) => void;
	onShapesChange: (id: string, shapes: Shape[]) => void;
	onRemoveImage: (id: string) => void;
	form: IssueReportForm;
	onFormChange: (patch: Partial<IssueReportForm>) => void;
	/** Closes the dialog so the user can navigate and capture another page. */
	onAddAnother: () => void;
	/** Throws away the whole draft. */
	onDiscard: () => void;
	onSent: () => void;
}

export function IssueReportDialog({
	open,
	onOpenChange,
	images,
	selectedId,
	onSelect,
	onShapesChange,
	onRemoveImage,
	form,
	onFormChange,
	onAddAnother,
	onDiscard,
	onSent,
}: IssueReportDialogProps) {
	const { data: session } = useSession();
	const [preparing, setPreparing] = useState(false);
	const { data: recipientConfig } = api.issueReport.getRecipients.useQuery(
		undefined,
		{ enabled: open },
	);

	const send = api.issueReport.send.useMutation({
		onSuccess: () => {
			toast.success("Report sent");
			onSent();
		},
		onError: (error) => {
			toast.error("Failed to send report", { description: error.message });
		},
	});

	const toggleRecipient = (email: string, checked: boolean) => {
		onFormChange({
			ccEmails: checked
				? [...form.ccEmails, email]
				: form.ccEmails.filter((e) => e !== email),
		});
	};

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		setPreparing(true);
		try {
			const screenshots = await Promise.all(
				images.map(async (image) => ({
					pageUrl: image.pageUrl,
					base64: await renderMarkedUpJpeg(image),
				})),
			);
			send.mutate({
				subject: form.subject,
				body: form.body,
				ccEmails: form.ccEmails,
				screenshots,
			});
		} catch {
			toast.error("Could not prepare the screenshots");
		} finally {
			setPreparing(false);
		}
	};

	const selected = images.find((image) => image.id === selectedId) ?? images[0];

	// The sender is already on the email, so they are not offered as a recipient.
	const ownEmail = session?.user.email?.toLowerCase();
	const recipients = (recipientConfig?.recipients ?? [])
		.filter((recipient) => recipient.email !== ownEmail)
		.sort((a, b) => a.name.localeCompare(b.name));

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-6xl">
				<form className="grid gap-4" onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Report an issue</DialogTitle>
						<DialogDescription>
							Mark up the screenshots to point out the problem, then describe
							what happened.
						</DialogDescription>
					</DialogHeader>

					{selected && (
						<ScreenshotEditor
							image={selected}
							key={selected.id}
							onShapesChange={(shapes) => onShapesChange(selected.id, shapes)}
						/>
					)}

					{images.length === 0 && (
						<p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
							A report needs at least one screenshot. Use "Add another
							screenshot" to capture a page.
						</p>
					)}

					<div className="flex flex-wrap items-center gap-2">
						{images.map((image, index) => (
							<div className="relative" key={image.id}>
								<button
									aria-label={`Edit screenshot ${index + 1}`}
									className={cn(
										"block overflow-hidden rounded-md border-2",
										image.id === selected?.id
											? "border-primary"
											: "border-transparent opacity-70 hover:opacity-100",
									)}
									onClick={() => onSelect(image.id)}
									type="button"
								>
									{/* biome-ignore lint/performance/noImgElement: data URL thumbnail */}
									<img
										alt={`Screenshot ${index + 1}`}
										className="h-14 w-24 object-cover object-top"
										src={image.src}
									/>
								</button>
								<button
									aria-label={`Remove screenshot ${index + 1}`}
									className="absolute -top-1.5 -right-1.5 rounded-full border bg-background p-0.5 hover:bg-accent"
									onClick={() => onRemoveImage(image.id)}
									type="button"
								>
									<X className="h-3 w-3" />
								</button>
							</div>
						))}
						<Button
							disabled={images.length >= MAX_ISSUE_REPORT_SCREENSHOTS}
							onClick={onAddAnother}
							size="sm"
							type="button"
							variant="outline"
						>
							<ImagePlus />
							Add another screenshot
						</Button>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="issue-subject">Subject</Label>
						<Input
							id="issue-subject"
							maxLength={200}
							onChange={(e) => onFormChange({ subject: e.target.value })}
							required
							value={form.subject}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="issue-body">Message</Label>
						<Textarea
							id="issue-body"
							maxLength={5000}
							onChange={(e) => onFormChange({ body: e.target.value })}
							required
							rows={5}
							value={form.body}
						/>
					</div>

					{recipients.length > 0 && (
						<fieldset>
							<legend className="mb-2 font-medium text-sm">
								Include on email
							</legend>
							<div className="flex flex-wrap gap-x-4 gap-y-2">
								{recipients.map((recipient) => (
									<Label
										className="flex items-center gap-2 font-normal"
										key={recipient.email}
									>
										<Checkbox
											checked={form.ccEmails.includes(recipient.email)}
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
						<Button onClick={onDiscard} type="button" variant="outline">
							Discard
						</Button>
						<Button
							disabled={images.length === 0 || preparing || send.isPending}
							type="submit"
						>
							{preparing || send.isPending ? "Sending..." : "Send"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
