import type { CheckedState } from "@radix-ui/react-checkbox";
import { Checkbox } from "@ui/checkbox";
import { Label } from "@ui/label";
import { Separator } from "@ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { logger } from "~/lib/logger";
import { api } from "~/trpc/react";

const log = logger.child({ module: "BabyNetBoxes" });

interface BabyNetBoxesProps {
	clientId: number;
	readOnly?: boolean;
}

export function BabyNetBoxes({
	clientId,
	readOnly = false,
}: BabyNetBoxesProps) {
	const utils = api.useUtils();
	const can = useCheckPermission();
	const canBabyNetERNeeded = can("clients:records:needed");
	const canBabyNetERDownloaded = can("clients:records:babynet");

	const { data: client } = api.clients.getOne.useQuery(
		{
			column: "id",
			value: clientId.toString(),
		},
		{ enabled: !!clientId },
	);

	const [BabyNetERNeeded, setBabyNetERNeeded] = useState(false);
	const [BabyNetERDownloaded, setBabyNetERDownloaded] = useState(false);

	useEffect(() => {
		setBabyNetERNeeded(client?.babyNetERNeeded ?? false);
	}, [client?.babyNetERNeeded]);

	useEffect(() => {
		setBabyNetERDownloaded(client?.babyNetERDownloaded ?? false);
	}, [client?.babyNetERDownloaded]);

	const handleError = (error: unknown, action: string) => {
		const message = error instanceof Error ? error.message : "Unknown error";
		log.error(error, `Failed to ${action}`);
		toast.error(`Failed to ${action}`, {
			description: message,
			duration: 10000,
		});
		utils.clients.getOne.invalidate({ value: clientId.toString() });
	};

	const updateClientMutation = api.clients.update.useMutation({
		onSuccess: () => {
			utils.clients.getOne.invalidate({ value: clientId.toString() });
		},
		onError: (error) => handleError(error, "update client 'Needed' status"),
	});

	const handleERNeededChange = (checked: CheckedState) => {
		const newCheckedState = checked === "indeterminate" ? false : checked;

		setBabyNetERNeeded(newCheckedState);

		if (!clientId) return;

		updateClientMutation.mutate({
			clientId: clientId,
			babyNetERNeeded: newCheckedState,
		});
	};

	const handleERDownloadedChange = (checked: CheckedState) => {
		const newCheckedState = checked === "indeterminate" ? false : checked;

		if (!clientId) return;

		if (client?.babyNetERNeeded || BabyNetERNeeded) {
			setBabyNetERDownloaded(newCheckedState);
			updateClientMutation.mutate({
				clientId: clientId,
				babyNetERDownloaded: newCheckedState,
			});
		} else {
			toast.error("Error", {
				description: "Needed must be set before flagging downloaded.",
			});
		}
	};

	const canEditNeeded = !readOnly && !BabyNetERDownloaded && canBabyNetERNeeded;
	const canEditDownloaded =
		!readOnly && BabyNetERNeeded && canBabyNetERDownloaded;

	const neededId = useId();
	const downloadedId = useId();

	const tooltipNeeded = BabyNetERDownloaded
		? "The Evaluation Report has already been downloaded."
		: !canEditNeeded && "Missing permissions.";

	const tooltipDownloaded = !BabyNetERNeeded
		? "Needed must be set before flagging downloaded."
		: !canEditDownloaded && "Missing permissions.";

	return (
		<div className="w-full">
			<h4 className="mb-2 font-bold leading-none">BabyNet Evaluation Report</h4>
			<div className="flex h-[16px] flex-row items-center gap-3">
				<Tooltip>
					<TooltipTrigger>
						<div className="flex items-center gap-2">
							<Checkbox
								checked={BabyNetERNeeded}
								disabled={!canEditNeeded}
								id={neededId}
								onCheckedChange={handleERNeededChange}
							/>
							<Label htmlFor={neededId}>Needed</Label>
						</div>
					</TooltipTrigger>
					{!canEditNeeded && !readOnly && (
						<TooltipContent>
							<p>{tooltipNeeded}</p>
						</TooltipContent>
					)}
				</Tooltip>

				<Separator orientation="vertical" />

				<Tooltip>
					<TooltipTrigger>
						<div className="flex items-center gap-2">
							<Checkbox
								checked={BabyNetERDownloaded}
								disabled={!canEditDownloaded}
								id={downloadedId}
								onCheckedChange={handleERDownloadedChange}
							/>
							<Label htmlFor={downloadedId}>Downloaded</Label>
						</div>
					</TooltipTrigger>
					{!canEditDownloaded && !readOnly && (
						<TooltipContent>
							<p>{tooltipDownloaded}</p>
						</TooltipContent>
					)}
				</Tooltip>
			</div>
		</div>
	);
}
