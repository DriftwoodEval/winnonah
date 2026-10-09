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
} from "~/lib/issue-titles";

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

	const moveList = (id: IssueListId, dir: -1 | 1) => {
		const idx = visibleOrder.indexOf(id);
		const next = idx + dir;
		if (idx === -1 || next < 0 || next >= visibleOrder.length) return;

		const reordered = [...visibleOrder];
		const tmp = reordered[idx];
		reordered[idx] = reordered[next] as IssueListId;
		reordered[next] = tmp as IssueListId;

		// Lists the user can't see keep their saved spots in the full order,
		// so splice the reordered visible ids back into place.
		let visibleIndex = 0;
		onChange(
			order.map((orderedId) =>
				can(ISSUE_LIST_PERMISSIONS[orderedId])
					? (reordered[visibleIndex++] as IssueListId)
					: orderedId,
			),
		);
	};

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
				<div className="max-h-[70vh] space-y-1 overflow-y-auto">
					<p className="mb-2 font-medium text-sm">Issue List Order</p>
					{visibleOrder.map((id, idx) => (
						<div
							className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 p-2"
							key={id}
						>
							<span className="flex-1 text-sm">{ISSUE_TITLES[id]}</span>
							<div className="flex items-center gap-0.5">
								<Button
									disabled={idx === 0}
									onClick={() => moveList(id, -1)}
									size="icon-sm"
									variant="ghost"
								>
									<ArrowUp className="h-3 w-3" />
								</Button>
								<Button
									disabled={idx === visibleOrder.length - 1}
									onClick={() => moveList(id, 1)}
									size="icon-sm"
									variant="ghost"
								>
									<ArrowDown className="h-3 w-3" />
								</Button>
							</div>
						</div>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
