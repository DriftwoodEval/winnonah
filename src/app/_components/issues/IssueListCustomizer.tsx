"use client";

import { Button } from "@ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { ArrowDown, ArrowUp, Settings } from "lucide-react";
import { useCheckPermission } from "~/hooks/use-check-permission";
import {
	ISSUE_LIST_PERMISSIONS,
	ISSUE_TITLES,
	type IssueListId,
	splitActionItems,
} from "~/lib/issues/issue-titles";

interface IssueListCustomizerProps {
	order: IssueListId[];
	onChange: (order: IssueListId[]) => void;
}

export function IssueListCustomizer({
	order,
	onChange,
}: IssueListCustomizerProps) {
	const can = useCheckPermission();
	const visibleOrder = order.filter((id) => can(ISSUE_LIST_PERMISSIONS[id]));
	const { actionItems, issues } = splitActionItems(visibleOrder);

	// Lists move within their own section: action items never swap with issues.
	const moveList = (group: IssueListId[], id: IssueListId, dir: -1 | 1) => {
		const idx = group.indexOf(id);
		const next = idx + dir;
		if (idx === -1 || next < 0 || next >= group.length) return;

		const a = group[idx] as IssueListId;
		const b = group[next] as IssueListId;
		const swapped = visibleOrder.map((orderedId) => {
			if (orderedId === a) return b;
			if (orderedId === b) return a;
			return orderedId;
		});

		// Lists the user can't see keep their saved spots in the full order,
		// so splice the reordered visible ids back into place.
		let visibleIndex = 0;
		onChange(
			order.map((orderedId) =>
				can(ISSUE_LIST_PERMISSIONS[orderedId])
					? (swapped[visibleIndex++] as IssueListId)
					: orderedId,
			),
		);
	};

	const renderGroup = (label: string, group: IssueListId[]) =>
		group.length > 0 && (
			<div className="space-y-1">
				<p className="mb-2 font-medium text-sm">{label}</p>
				{group.map((id, idx) => (
					<div
						className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 p-2"
						key={id}
					>
						<span className="flex-1 text-sm">{ISSUE_TITLES[id]}</span>
						<div className="flex items-center gap-0.5">
							<Button
								disabled={idx === 0}
								onClick={() => moveList(group, id, -1)}
								size="icon-sm"
								variant="ghost"
							>
								<ArrowUp className="h-3 w-3" />
							</Button>
							<Button
								disabled={idx === group.length - 1}
								onClick={() => moveList(group, id, 1)}
								size="icon-sm"
								variant="ghost"
							>
								<ArrowDown className="h-3 w-3" />
							</Button>
						</div>
					</div>
				))}
			</div>
		);

	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button size="icon" variant="outline">
							<Settings className="h-4 w-4" />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>
					<p>Reorder Issue Lists</p>
				</TooltipContent>
			</Tooltip>
			<PopoverContent align="end" className="w-72">
				<div className="max-h-[70vh] space-y-4 overflow-y-auto">
					{renderGroup("Action Item Order", actionItems)}
					{renderGroup("Issue List Order", issues)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
