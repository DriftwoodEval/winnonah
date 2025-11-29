import type { CheckedState } from "@radix-ui/react-checkbox";
import { Checkbox } from "@ui/checkbox";
import { Label } from "@ui/label";
import { Separator } from "@ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { useSession } from "next-auth/react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { logger } from "~/lib/logger";
import { hasPermission } from "~/lib/utils";
import { api } from "~/trpc/react";

const log = logger.child({ module: "IFSPBoxes" });

interface IFSPBoxesProps {
	clientId: number;
	readOnly?: boolean;
}

export function IFSPBoxes({ clientId, readOnly = false }: IFSPBoxesProps) {
	const { data: session } = useSession();
	const utils = api.useUtils();

	const canRecordsNeeded = session
		? hasPermission(session.user.permissions, "clients:records:needed")
		: false;
	const canRecordsReceived = session
		? hasPermission(session.user.permissions, "clients:records:create")
		: false;

	const { data: client } = api.clients.getOne.useQuery(
		{
			column: "id",
			value: clientId.toString(),
		},
		{ enabled: !!clientId },
	);

	const [IFSP, setIFSP] = useState(false);
	const [IFSPDownloaded, setIFSPDownloaded] = useState(false);

	useEffect(() => {
		setIFSP(client?.ifsp ?? false);
	}, [client?.ifsp]);

	useEffect(() => {
		setIFSPDownloaded(client?.ifspDownloaded ?? false);
	}, [client?.ifspDownloaded]);

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

	const handleIFSPChange = (checked: CheckedState) => {
		const newCheckedState = checked === "indeterminate" ? false : checked;

		setIFSP(newCheckedState);

		if (!clientId) return;

		updateClientMutation.mutate({
			clientId: clientId,
			ifsp: newCheckedState,
		});
	};

	const handleIFSPDownloadedChange = (checked: CheckedState) => {
		const newCheckedState = checked === "indeterminate" ? false : checked;

		setIFSPDownloaded(newCheckedState);

		if (!clientId) return;

		if (client?.ifsp) {
			updateClientMutation.mutate({
				clientId: clientId,
				ifspDownloaded: newCheckedState,
			});
		} else {
			toast.error("Error", {
				description: "IFSP must be set before flagging downloaded.",
			});
		}
	};

	const canEditIFSP = !readOnly && !IFSPDownloaded && canRecordsNeeded;
	const canEditIFSPDownloaded = !readOnly && IFSP && canRecordsReceived;

	const IFSPId = useId();
	const IFSPDownloadedId = useId();

	const tooltipIFSP = IFSPDownloaded
		? "The IFSP has already been downloaded."
		: !canEditIFSP && "Missing permissions.";

	const tooltipIFSPDownloaded = !IFSP
		? "The IFSP must be set before flagging downloaded."
		: !canEditIFSPDownloaded && "Missing permissions.";

	return (
		<div className="w-full">
			<h4 className="mb-2 font-bold leading-none">IFSP</h4>
			<div className="flex h-[16px] flex-row items-center gap-3">
				<Tooltip>
					<TooltipTrigger>
						<div className="flex items-center gap-2">
							<Checkbox
								checked={IFSP}
								disabled={!canEditIFSP}
								id={IFSPId}
								onCheckedChange={handleIFSPChange}
							/>
							<Label htmlFor={IFSPId}>IFSP</Label>
						</div>
					</TooltipTrigger>
					{!canEditIFSP && !readOnly && (
						<TooltipContent>
							<p>{tooltipIFSP}</p>
						</TooltipContent>
					)}
				</Tooltip>

				<Separator orientation="vertical" />

				<Tooltip>
					<TooltipTrigger>
						<div className="flex items-center gap-2">
							<Checkbox
								checked={IFSPDownloaded}
								disabled={!canEditIFSPDownloaded}
								id={IFSPDownloadedId}
								onCheckedChange={handleIFSPDownloadedChange}
							/>
							<Label htmlFor={IFSPDownloadedId}>IFSP Downloaded</Label>
						</div>
					</TooltipTrigger>
					{!canEditIFSPDownloaded && !readOnly && (
						<TooltipContent>
							<p>{tooltipIFSPDownloaded}</p>
						</TooltipContent>
					)}
				</Tooltip>
			</div>
		</div>
	);
}
