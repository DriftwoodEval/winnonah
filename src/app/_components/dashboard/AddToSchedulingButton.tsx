"use client";

import { Button } from "@ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@ui/tooltip";
import { CalendarCheck, CalendarPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { schedulingCodeForSection } from "~/lib/dashboard";
import { api } from "~/trpc/react";

interface AddToSchedulingButtonProps {
	clientId: number;
	sectionTitle: string;
	onSchedulingTable: boolean;
}

export function AddToSchedulingButton({
	clientId,
	sectionTitle,
	onSchedulingTable,
}: AddToSchedulingButtonProps) {
	const utils = api.useUtils();

	const addScheduling = api.scheduling.add.useMutation({
		onSuccess: () => {
			toast.success("Added to scheduling");
			utils.scheduling.get.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to add to scheduling", {
				description: error.message,
			});
		},
	});

	if (onSchedulingTable) {
		return (
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="inline-flex h-7 w-7 shrink-0 items-center justify-center">
							<CalendarCheck className="h-4 w-4 text-muted-foreground opacity-50" />
						</span>
					</TooltipTrigger>
					<TooltipContent>Already on scheduling page</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	return (
		<Button
			className="shrink-0"
			disabled={addScheduling.isPending}
			onClick={() =>
				addScheduling.mutate({
					clientId,
					code: schedulingCodeForSection(sectionTitle),
				})
			}
			size="icon-sm"
			title="Add to Scheduling"
			variant="ghost"
		>
			{addScheduling.isPending ? (
				<Loader2 className="h-4 w-4 animate-spin" />
			) : (
				<CalendarPlus className="h-4 w-4" />
			)}
		</Button>
	);
}
