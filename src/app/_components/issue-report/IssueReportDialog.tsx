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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Textarea } from "@ui/textarea";
import { ImagePlus, Upload, X } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "~/lib/utils";
import {
	ISSUE_REPORT_PRIORITIES,
	type IssueReportPriority,
	MAX_ISSUE_REPORT_SCREENSHOTS,
} from "~/lib/validations/config";
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
	type: "bug" | "feature";
	priority: IssueReportPriority;
	ccEmails: string[];
}

interface IssueReportDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	images: DraftImage[];
	selectedId: string | null;
	onSelect: (id: string) => void;
	onShapesChange: (id: string, shapes: Shape[]) => void;
	/** Adds image files the user picked from their device. */
	onUploadImages: (files: File[]) => void;
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
	onUploadImages,
	onRemoveImage,
	form,
	onFormChange,
	onAddAnother,
	onDiscard,
	onSent,
}: IssueReportDialogProps) {
	const { data: session } = useSession();
	const [preparing, setPreparing] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { data: recipientConfig } = api.issueReport.getRecipients.useQuery(
		undefined,
		{ enabled: open },
	);

	const send = api.issueReport.submit.useMutation({
		// Retry when the request never got a tRPC response (a dropped upload or a
		// proxy error page), but not when the server answered with an error.
		retry: (failureCount, error) => failureCount < 2 && !error.data,
		onSuccess: () => {
			toast.success("Report submitted");
			onSent();
		},
		onError: (error) => {
			toast.error("Failed to submit report", { description: error.message });
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
				type: form.type,
				priority: form.priority,
				pageUrl: images[0]?.pageUrl ?? window.location.href,
				userAgent: navigator.userAgent.slice(0, 500),
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
	const needsScreenshot = form.type === "bug" && images.length === 0;

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
						<DialogTitle>
							{form.type === "bug" ? "Report a bug" : "Request a feature"}
						</DialogTitle>
						<DialogDescription>
							{form.type === "bug"
								? "Mark up the screenshots to point out the problem, then describe what happened."
								: "Describe what you would like. A screenshot is optional."}{" "}
							Track your reports under{" "}
							<Link className="underline" href="/issue-reports">
								My Reports
							</Link>
							.
						</DialogDescription>
					</DialogHeader>

					<div className="flex gap-2">
						{(["bug", "feature"] as const).map((type) => (
							<Button
								key={type}
								onClick={() => onFormChange({ type })}
								size="sm"
								type="button"
								variant={form.type === type ? "default" : "outline"}
							>
								{type === "bug" ? "Bug" : "Feature request"}
							</Button>
						))}
					</div>

					{selected && (
						<ScreenshotEditor
							image={selected}
							key={selected.id}
							onShapesChange={(shapes) => onShapesChange(selected.id, shapes)}
						/>
					)}

					{needsScreenshot && (
						<p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
							A bug report needs at least one image. Use "Add another
							screenshot" to capture a page, "Upload image" to add your own, or
							switch to Feature request.
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
						<Button
							disabled={images.length >= MAX_ISSUE_REPORT_SCREENSHOTS}
							onClick={() => fileInputRef.current?.click()}
							size="sm"
							type="button"
							variant="outline"
						>
							<Upload />
							Upload image
						</Button>
						<input
							accept="image/*"
							className="hidden"
							multiple
							onChange={(e) => {
								onUploadImages(Array.from(e.target.files ?? []));
								e.target.value = "";
							}}
							ref={fileInputRef}
							type="file"
						/>
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

					<div className="grid gap-2">
						<Label htmlFor="issue-priority">Priority</Label>
						<Select
							onValueChange={(priority) =>
								onFormChange({ priority: priority as IssueReportPriority })
							}
							value={form.priority}
						>
							<SelectTrigger className="w-40" id="issue-priority">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{ISSUE_REPORT_PRIORITIES.map((priority) => (
									<SelectItem key={priority} value={priority}>
										{priority}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{recipients.length > 0 && (
						<fieldset>
							<legend className="mb-2 text-sm font-medium">
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
							disabled={needsScreenshot || preparing || send.isPending}
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
