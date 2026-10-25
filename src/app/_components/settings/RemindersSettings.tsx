"use client";

import { ClientHoverCard } from "@components/client/ClientHoverCard";
import { Badge } from "@ui/badge";
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
import { formatInBusinessTime, formatReminderOffset } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";
import { Redact } from "../redaction/Redact";
import { EmptyState } from "../shared/EmptyState";
import { ErrorState } from "../shared/ErrorState";
import OfficesSettings from "./OfficesSettings";
import { ReminderTemplateDialog } from "./ReminderTemplateDialog";

type ReminderTemplate = RouterOutputs["reminders"]["getTemplates"][number];

export default function ReminderSettings() {
	const utils = api.useUtils();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [selectedTemplate, setSelectedTemplate] =
		useState<ReminderTemplate | null>(null);

	const { data: settings } = api.reminders.getSettings.useQuery();
	const { data: templates } = api.reminders.getTemplates.useQuery();
	const { data: offices } = api.offices.getAll.useQuery({
		includeArchived: true,
	});
	const {
		data: logs,
		isError: logsError,
		refetch: refetchLogs,
	} = api.reminders.getLogs.useQuery({
		limit: 50,
		offset: 0,
	});
	const {
		data: replyLogs,
		isError: repliesError,
		refetch: refetchReplies,
	} = api.reminders.getReplyLogs.useQuery({
		limit: 50,
		offset: 0,
	});

	const confirmationReplies = replyLogs?.filter((r) => r.isConfirmation);
	const nonConfirmationReplies = replyLogs?.filter((r) => !r.isConfirmation);

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
		<div className="space-y-8 px-4">
			<h3 className="font-bold text-lg">Reminder Configuration</h3>

			<Card>
				<CardHeader>
					<CardTitle>Quiet Time</CardTitle>
					<CardDescription>
						Reminders will not be sent during these hours.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

			<OfficesSettings />

			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h2 className="font-semibold text-xl">Reminder Scripts</h2>
					<Button onClick={handleCreate}>Add Template</Button>
				</div>

				{templates?.map((template) => (
					<Card key={template.id}>
						<CardHeader className="flex flex-row items-center justify-between">
							<div className="space-y-1">
								<CardTitle className="flex items-center gap-2">
									{template.name}
									{template.isEiReminder && <Badge variant="outline">EI</Badge>}
								</CardTitle>
								<CardDescription>
									{template.triggerKeyword && (
										<span>Keyword: "{template.triggerKeyword}" • </span>
									)}
									{(template.triggerDaEval ??
										(template.triggerLocationKey?.length
											? template.triggerLocationKey
											: null)) && (
										<span>
											{template.triggerDaEval ?? "Any appointment type"} @{" "}
											{template.triggerLocationKey?.length
												? template.triggerLocationKey
														.map(
															(k) =>
																offices?.find((o) => o.key === k)?.prettyName ??
																k,
														)
														.join(", ")
												: "Any location"}{" "}
											•{" "}
										</span>
									)}
									{(template.minAgeYears != null ||
										template.maxAgeYears != null) && (
										<span>
											Age:{" "}
											{template.minAgeYears != null &&
											template.maxAgeYears != null
												? `${template.minAgeYears}-${template.maxAgeYears}`
												: template.minAgeYears != null
													? `${template.minAgeYears}+`
													: `up to ${template.maxAgeYears}`}{" "}
											•{" "}
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
					{logsError ? (
						<ErrorState compact onRetry={refetchLogs} />
					) : !logs?.length ? (
						<EmptyState compact title="No reminders sent yet" />
					) : (
						<div className="max-h-96 overflow-y-auto">
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
													<ClientHoverCard clientHash={log.clientHash}>
														<Redact>{`${log.clientFirstName} ${log.clientLastName}`}</Redact>
													</ClientHoverCard>
												</Link>
											</TableCell>
											<TableCell className="whitespace-nowrap text-xs">
												{formatInBusinessTime(
													log.appointmentStart,
													"MMM d, yyyy p",
												)}
											</TableCell>
											<TableCell className="text-xs">
												{log.templateName}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Confirmation Replies</CardTitle>
					<CardDescription>
						The 50 most recent replies recognized as confirmations, and the
						message sent back.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{repliesError ? (
						<ErrorState compact onRetry={refetchReplies} />
					) : !confirmationReplies?.length ? (
						<EmptyState compact title="No confirmation replies yet" />
					) : (
						<div className="max-h-96 overflow-y-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Received</TableHead>
										<TableHead>Client</TableHead>
										<TableHead>Appointment</TableHead>
										<TableHead>Reply</TableHead>
										<TableHead>Sent Back</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{confirmationReplies.map((reply) => (
										<TableRow key={reply.id}>
											<TableCell
												className="whitespace-nowrap text-muted-foreground text-xs"
												title={format(reply.receivedAt, "PPpp")}
											>
												{formatDistanceToNow(reply.receivedAt, {
													addSuffix: true,
												})}
											</TableCell>
											<TableCell>
												<Link
													className="hover:underline"
													href={`/clients/${reply.clientHash}`}
												>
													<ClientHoverCard clientHash={reply.clientHash}>
														<Redact>{`${reply.clientFirstName} ${reply.clientLastName}`}</Redact>
													</ClientHoverCard>
												</Link>
											</TableCell>
											<TableCell className="whitespace-nowrap text-xs">
												{formatInBusinessTime(
													reply.appointmentStart,
													"MMM d, yyyy p",
												)}
											</TableCell>
											<TableCell className="text-xs">
												{reply.incomingText}
											</TableCell>
											<TableCell className="text-muted-foreground text-xs">
												{reply.confirmationReplyText ?? "—"}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Non-Confirmation Replies</CardTitle>
					<CardDescription>
						The 50 most recent replies that were not recognized as
						confirmations.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{repliesError ? (
						<ErrorState compact onRetry={refetchReplies} />
					) : !nonConfirmationReplies?.length ? (
						<EmptyState compact title="No non-confirmation replies yet" />
					) : (
						<div className="max-h-96 overflow-y-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Received</TableHead>
										<TableHead>Client</TableHead>
										<TableHead>Appointment</TableHead>
										<TableHead>Reply</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{nonConfirmationReplies.map((reply) => (
										<TableRow key={reply.id}>
											<TableCell
												className="whitespace-nowrap text-muted-foreground text-xs"
												title={format(reply.receivedAt, "PPpp")}
											>
												{formatDistanceToNow(reply.receivedAt, {
													addSuffix: true,
												})}
											</TableCell>
											<TableCell>
												<Link
													className="hover:underline"
													href={`/clients/${reply.clientHash}`}
												>
													<ClientHoverCard clientHash={reply.clientHash}>
														<Redact>{`${reply.clientFirstName} ${reply.clientLastName}`}</Redact>
													</ClientHoverCard>
												</Link>
											</TableCell>
											<TableCell className="whitespace-nowrap text-xs">
												{formatInBusinessTime(
													reply.appointmentStart,
													"MMM d, yyyy p",
												)}
											</TableCell>
											<TableCell className="text-xs">
												{reply.incomingText}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
