"use client";

import { Badge } from "@ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { ScrollArea } from "@ui/scroll-area";
import { Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { api } from "~/trpc/react";

const TASK_TYPE_LABELS: Record<string, string> = {
	evaluator_rematch: "Evaluator rematch",
	appointment_reminders: "Appointment reminders",
	questionnaire_reminders: "Questionnaire reminders",
	referral_fax_intake: "AI referral fax lookup",
};

function taskLabel(type: string) {
	return TASK_TYPE_LABELS[type] ?? type;
}

function relativeTime(date: Date) {
	const seconds = Math.round((Date.now() - date.getTime()) / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	return `${hours}h ago`;
}

export function TaskQueueBubble() {
	const { status } = useSession();
	const [open, setOpen] = useState(false);

	const { data: initialTasks } = api.tasks.getActive.useQuery(undefined, {
		enabled: status === "authenticated",
	});

	const { data: liveTasks } = api.tasks.onTaskUpdate.useSubscription(
		undefined,
		{ enabled: status === "authenticated" },
	);

	const tasks = liveTasks ?? initialTasks ?? [];
	const runningCount = tasks.filter((t) => t.status === "running").length;

	if (tasks.length === 0) {
		return null;
	}

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Badge
					className="flex cursor-pointer items-center gap-1"
					variant={runningCount > 0 ? "default" : "secondary"}
				>
					{runningCount > 0 && <Loader2 className="h-3 w-3 animate-spin" />}
					{runningCount > 0 ? runningCount : tasks.length}{" "}
					<span className="hidden sm:inline">
						{runningCount > 0 ? "running" : "recent tasks"}
					</span>
				</Badge>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 p-2">
				<p className="mb-2 px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
					Background Tasks
				</p>
				<ScrollArea className="max-h-80">
					<div className="flex flex-col gap-2">
						{tasks.map((task) => (
							<div
								className="rounded-md border px-2 py-1.5 text-sm"
								key={task.id}
							>
								<div className="flex items-center justify-between gap-2">
									<span className="font-medium">{taskLabel(task.type)}</span>
									<Badge
										className="shrink-0"
										variant={
											task.status === "running"
												? "default"
												: task.status === "failed"
													? "destructive"
													: "secondary"
										}
									>
										{task.status}
									</Badge>
								</div>
								{task.detail && (
									<p className="truncate text-muted-foreground text-xs">
										{task.detail}
									</p>
								)}
								{task.progressTotal != null && task.progressCurrent != null && (
									<p className="text-muted-foreground text-xs">
										{task.progressCurrent} / {task.progressTotal}
									</p>
								)}
								<p className="text-muted-foreground text-xs">
									{relativeTime(new Date(task.startedAt))}
								</p>
							</div>
						))}
					</div>
				</ScrollArea>
			</PopoverContent>
		</Popover>
	);
}
