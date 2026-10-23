"use client";

import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import { Input } from "@ui/input";
import { Skeleton } from "@ui/skeleton";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { IssueReportRecipient } from "~/lib/validations/config";
import { issueReportRecipientSchema } from "~/lib/validations/config";
import { api } from "~/trpc/react";

export default function IssueReportSettings() {
	const utils = api.useUtils();
	const { data, isLoading } = api.issueReport.getRecipients.useQuery();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");

	const setRecipients = api.issueReport.setRecipients.useMutation({
		onSuccess: () => {
			toast.success("Recipients updated");
			utils.issueReport.getRecipients.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to update recipients", {
				description: error.message,
			});
		},
	});

	const recipients = data?.recipients ?? [];

	const save = (next: IssueReportRecipient[]) =>
		setRecipients.mutate({ recipients: next });

	const handleAdd = (event: React.FormEvent) => {
		event.preventDefault();
		const parsed = issueReportRecipientSchema.safeParse({ name, email });
		if (!parsed.success) {
			toast.error("Enter a name and a valid email address");
			return;
		}
		if (recipients.some((r) => r.email === parsed.data.email)) {
			toast.error("That email is already in the list");
			return;
		}
		save([...recipients, parsed.data]);
		setName("");
		setEmail("");
	};

	return (
		<Card>
			<CardContent className="space-y-3">
				<h3 className="font-semibold text-sm">Issue Report Recipients</h3>
				<p className="text-muted-foreground text-sm">
					People staff can choose to include on an issue report email, in
					addition to the tech address.
				</p>
				{isLoading ? (
					<Skeleton className="h-4 w-48" />
				) : recipients.length === 0 ? (
					<p className="text-sm">No people added yet</p>
				) : (
					<ul className="space-y-1">
						{recipients.map((recipient) => (
							<li
								className="flex items-center justify-between gap-2 text-sm"
								key={recipient.email}
							>
								<span>
									{recipient.name}{" "}
									<span className="text-muted-foreground">
										{recipient.email}
									</span>
								</span>
								<Button
									disabled={setRecipients.isPending}
									onClick={() =>
										save(recipients.filter((r) => r.email !== recipient.email))
									}
									size="icon-sm"
									type="button"
									variant="ghost"
								>
									<Trash2 />
									<span className="sr-only">Remove {recipient.name}</span>
								</Button>
							</li>
						))}
					</ul>
				)}
				<form className="flex flex-wrap gap-2" onSubmit={handleAdd}>
					<Input
						className="w-48"
						onChange={(e) => setName(e.target.value)}
						placeholder="Name"
						value={name}
					/>
					<Input
						className="w-64"
						onChange={(e) => setEmail(e.target.value)}
						placeholder="Email"
						type="email"
						value={email}
					/>
					<Button
						disabled={setRecipients.isPending}
						type="submit"
						variant="outline"
					>
						Add
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
