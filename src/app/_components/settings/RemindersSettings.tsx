"use client";

import { Button } from "@ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/card";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Switch } from "@ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { format, formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { formatReminderOffset } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";
import { ReminderTemplateDialog } from "./ReminderTemplateDialog";

type ReminderTemplate = RouterOutputs["reminders"]["getTemplates"][number];

export default function ReminderSettings() {
	const utils = api.useUtils();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [selectedTemplate, setSelectedTemplate] =
		useState<ReminderTemplate | null>(null);

	const { data: settings } = api.reminders.getSettings.useQuery();
	const { data: templates } = api.reminders.getTemplates.useQuery();
	const { data: logs } = api.reminders.getLogs.useQuery({
		limit: 50,
		offset: 0,
	});

	const updateSettings = api.reminders.updateSettings.useMutation({
		onSuccess: () => {
			void utils.reminders.getSettings.invalidate();
			toast.success("Global settings updated");
		},
	});

	const upsertTemplate = api.reminders.upsertTemplate.useMutation({
		onSuccess: () => {
			void utils.reminders.getTemplates.invalidate();
		},
	});

	const handleEdit = (template: ReminderTemplate) => {
		setSelectedTemplate(template);
		setIsModalOpen(true);
	};

	const handleCreate = () => {
		setSelectedTemplate(null);
		setIsModalOpen(true);
	};

	const handleToggleActive = (
		template: ReminderTemplate,
		isActive: boolean,
	) => {
		upsertTemplate.mutate({
			...template,
			isActive,
		});
	};

	return (
		<div className="mx-auto space-y-8 p-8">
			<h1 className="font-bold text-3xl">Reminder Configuration</h1>

			<Card>
				<CardHeader>
					<CardTitle>Quiet Time</CardTitle>
					<CardDescription>
						Reminders will not be sent during these hours.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid grid-cols-2 gap-4">
					<div className="space-y-2">
						<Label>Quiet Start (Evening)</Label>
						<Input
							defaultValue={settings?.quietWindowStart?.slice(0, 5) ?? ""}
							onBlur={(e) => {
								updateSettings.mutate({ quietWindowStart: e.target.value });
							}}
							type="time"
						/>
					</div>
					<div className="space-y-2">
						<Label>Quiet End (Morning)</Label>
						<Input
							defaultValue={settings?.quietWindowEnd?.slice(0, 5) ?? ""}
							onBlur={(e) => {
								updateSettings.mutate({ quietWindowEnd: e.target.value });
							}}
							type="time"
						/>
					</div>
				</CardContent>
			</Card>

			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h2 className="font-semibold text-xl">Reminder Scripts</h2>
					<Button onClick={handleCreate}>Add Template</Button>
				</div>

				{templates?.map((template) => (
					<Card key={template.id}>
						<CardHeader className="flex flex-row items-center justify-between">
							<div className="space-y-1">
								<CardTitle>{template.name}</CardTitle>
								<CardDescription>
									{template.triggerKeyword && (
										<span>Keyword: "{template.triggerKeyword}" • </span>
									)}
									{template.triggerDaEval && template.triggerLocationKey && (
										<span>
											Match: {template.triggerDaEval} @{" "}
											{template.triggerLocationKey} •{" "}
										</span>
									)}
									{formatReminderOffset(template.sendOffsetHours)}
								</CardDescription>
							</div>
							<div className="flex items-center gap-4">
								<Switch
									checked={template.isActive}
									onCheckedChange={(checked) =>
										handleToggleActive(template, checked)
									}
								/>
								<Button
									onClick={() => handleEdit(template)}
									size="sm"
									variant="outline"
								>
									Edit Script
								</Button>
							</div>
						</CardHeader>
					</Card>
				))}
			</div>

			<ReminderTemplateDialog
				initialData={selectedTemplate ?? undefined}
				isOpen={isModalOpen}
				onClose={() => {
					setIsModalOpen(false);
					setSelectedTemplate(null);
				}}
			/>

			<Card>
				<CardHeader>
					<CardTitle>Reminder History</CardTitle>
					<CardDescription>The 50 most recent reminders sent.</CardDescription>
				</CardHeader>
				<CardContent>
					{!logs?.length ? (
						<p className="text-muted-foreground text-sm">
							No reminders sent yet.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Sent</TableHead>
									<TableHead>Client</TableHead>
									<TableHead>Appointment</TableHead>
									<TableHead>Template</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{logs.map((log) => (
									<TableRow key={log.id}>
										<TableCell
											className="whitespace-nowrap text-muted-foreground text-xs"
											title={format(log.sentAt, "PPpp")}
										>
											{formatDistanceToNow(log.sentAt, { addSuffix: true })}
										</TableCell>
										<TableCell>
											<Link
												className="hover:underline"
												href={`/clients/${log.clientHash}`}
											>
												{log.clientFirstName} {log.clientLastName}
											</Link>
										</TableCell>
										<TableCell className="whitespace-nowrap text-xs">
											{format(log.appointmentStart, "MMM d, yyyy p")}
										</TableCell>
										<TableCell className="text-xs">
											{log.templateName}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
