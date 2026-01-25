"use client";

import { Checkbox } from "@ui/checkbox";
import { Label } from "@ui/label";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { logger } from "~/lib/logger";
import { api } from "~/trpc/react";

interface ProtocolsScannedCheckboxProps {
	clientId: number;
	readOnly?: boolean;
}

const log = logger.child({ module: "ProtocolsScannedCheckbox" });

export function ProtocolsScannedCheckbox({
	clientId,
	readOnly,
}: ProtocolsScannedCheckboxProps) {
	const can = useCheckPermission();
	const utils = api.useUtils();

	const { data: punchClient, isLoading } =
		api.google.getClientFromPunch.useQuery(clientId.toString(), {
			enabled: !!clientId,
		});

	const setProtocolsScanned = api.google.setProtocolsScanned.useMutation({
		onMutate: async (newStatus) => {
			// Cancel any outgoing refetches (so they don't overwrite our optimistic update)
			await utils.google.getClientFromPunch.cancel(clientId.toString());

			// Snapshot the previous value
			const previousData = utils.google.getClientFromPunch.getData(
				clientId.toString(),
			);

			// Optimistically update to the new value
			utils.google.getClientFromPunch.setData(clientId.toString(), (old) => {
				if (!old) return old;
				return {
					...old,
					"Protocols scanned?": newStatus.protocolsScanned ? "TRUE" : "FALSE",
				};
			});

			return { previousData };
		},
		onSuccess: () => {
			toast.success("Protocols scanned status updated");
		},
		onError: (error, _newStatus, context) => {
			// If the mutation fails, use the context returned from onMutate to roll back
			if (context?.previousData) {
				utils.google.getClientFromPunch.setData(
					clientId.toString(),
					context.previousData,
				);
			}
			log.error(error, "Failed to update protocols scanned status");
			toast.error("Failed to update status", {
				description: error.message,
			});
		},
		onSettled: () => {
			// Always refetch after error or success to ensure we are in sync with the server
			utils.google.getClientFromPunch.invalidate(clientId.toString());
		},
	});

	const isChecked = punchClient?.["Protocols scanned?"] === "TRUE";
	const canEdit = can("clients:protocolsscanned") && !readOnly;

	return (
		<div className="flex items-center space-x-2">
			<Checkbox
				checked={isChecked}
				disabled={!canEdit || isLoading || setProtocolsScanned.isPending}
				id="protocols-scanned"
				onCheckedChange={(checked) => {
					setProtocolsScanned.mutate({
						clientId,
						protocolsScanned: checked === true,
					});
				}}
			/>
			<Label
				className="font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
				htmlFor="protocols-scanned"
			>
				Protocols Scanned
			</Label>
		</div>
	);
}
