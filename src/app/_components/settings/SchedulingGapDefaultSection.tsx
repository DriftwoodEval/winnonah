"use client";

import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { api } from "~/trpc/react";

export default function SchedulingGapDefaultSection() {
	const can = useCheckPermission();
	const canEdit = can("settings:evaluators");

	const { data: saved, isLoading } =
		api.schedulingHelper.getGapConfig.useQuery();
	const utils = api.useUtils();

	const setGapConfig = api.schedulingHelper.setGapConfig.useMutation({
		onSuccess: () => {
			toast.success("Default gap saved.");
			void utils.schedulingHelper.getGapConfig.invalidate();
		},
		onError: (err) =>
			toast.error("Failed to save default gap", { description: err.message }),
	});

	const [minutes, setMinutes] = useState("0");
	const [dirty, setDirty] = useState(false);

	useEffect(() => {
		if (saved) {
			setMinutes(String(saved.defaultGapMinutes));
			setDirty(false);
		}
	}, [saved]);

	if (isLoading) return null;

	return (
		<div className="mt-8 px-4">
			<div className="mb-3 flex items-center justify-between">
				<div>
					<h3 className="font-bold text-lg">
						Default Gap Between Appointments
					</h3>
					<p className="text-muted-foreground text-sm">
						Minutes required between an evaluator's appointments in the
						scheduling helper, when the evaluator has no override set.
					</p>
				</div>
				{canEdit && (
					<Button
						disabled={!dirty || setGapConfig.isPending}
						onClick={() =>
							setGapConfig.mutate({ defaultGapMinutes: Number(minutes) })
						}
						size="sm"
					>
						{setGapConfig.isPending ? "Saving..." : "Save"}
					</Button>
				)}
			</div>

			<Input
				className="w-32"
				disabled={!canEdit}
				min={0}
				onChange={(e) => {
					setMinutes(e.target.value);
					setDirty(true);
				}}
				step={5}
				type="number"
				value={minutes}
			/>
		</div>
	);
}
