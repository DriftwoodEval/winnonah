"use client";

import { Checkbox } from "@ui/checkbox";
import { Label } from "@ui/label";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@ui/tooltip";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { logger } from "~/lib/logger";
import { api } from "~/trpc/react";

const log = logger.child({ module: "EvaluationCheckbox" });

interface EvaluationCheckboxProps {
	clientId: number;
	readOnly?: boolean;
	compact?: boolean;
}

export function EvaluationCheckbox({
	clientId,
	readOnly = false,
	compact = false,
}: EvaluationCheckboxProps) {
	const utils = api.useUtils();
	const can = useCheckPermission();
	const canEdit = can("clients:records:evaluation");

	const { data: client } = api.clients.getOne.useQuery(
		{ column: "id", value: clientId.toString() },
		{ enabled: !!clientId },
	);

	const [checked, setChecked] = useState(false);

	useEffect(() => {
		setChecked(client?.evaluationInProcess ?? false);
	}, [client?.evaluationInProcess]);

	const updateClientMutation = api.clients.update.useMutation({
		onSuccess: () => {
			utils.clients.getOne.invalidate({ value: clientId.toString() });
		},
		onError: (error) => {
			const message = error instanceof Error ? error.message : "Unknown error";
			log.error(error, "Failed to update evaluation in process status");
			toast.error("Failed to update evaluation status", {
				description: message,
				duration: 10000,
			});
			utils.clients.getOne.invalidate({ value: clientId.toString() });
		},
	});

	const handleChange = (value: boolean | "indeterminate") => {
		const newChecked = value === "indeterminate" ? false : value;
		setChecked(newChecked);
		updateClientMutation.mutate({
			clientId,
			evaluationInProcess: newChecked,
		});
	};

	const checkboxId = useId();
	const disabled = readOnly || !canEdit;

	const checkboxRow = (
		<div className="flex items-center gap-2">
			<Checkbox
				checked={checked}
				disabled={disabled}
				id={checkboxId}
				onCheckedChange={handleChange}
			/>
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<Label htmlFor={checkboxId}>Evaluation In Process</Label>
					</TooltipTrigger>
					<TooltipContent>
						When requesting records, we were told an evaluation was in progress,
						check back later. Adds this client to the issues list.
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);

	if (compact) return checkboxRow;

	return (
		<div className="w-full">
			<h4 className="mb-2 font-bold leading-none">Evaluation</h4>
			{checkboxRow}
		</div>
	);
}
