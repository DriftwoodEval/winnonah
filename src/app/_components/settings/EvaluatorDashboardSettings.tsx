"use client";

import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Switch } from "@ui/switch";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { api } from "~/trpc/react";

export default function EvaluatorDashboardSettings() {
	const can = useCheckPermission();
	const canEdit = can("settings:evaluators");

	const { data: evaluators, isLoading: isEvalLoading } =
		api.evaluators.getAll.useQuery(undefined, { enabled: canEdit });
	const { data: config, isLoading: isConfigLoading } =
		api.evaluatorDashboard.getConfig.useQuery(undefined, { enabled: canEdit });
	const utils = api.useUtils();

	const setConfig = api.evaluatorDashboard.setConfig.useMutation({
		onSuccess: () => {
			toast.success("Dashboard settings saved.");
			void utils.evaluatorDashboard.getConfig.invalidate();
		},
		onError: (err) =>
			toast.error("Failed to save settings", { description: err.message }),
	});

	const setDashboardEvaluator =
		api.evaluators.setEvaluatorDashboard.useMutation({
			onSuccess: () => {
				toast.success("Dashboard evaluator updated.");
				void utils.evaluators.getAll.invalidate();
			},
			onError: (err) =>
				toast.error("Failed to update evaluator", { description: err.message }),
		});

	const [dueDateWeeks, setDueDateWeeks] = useState(4);
	const [dirty, setDirty] = useState(false);

	useEffect(() => {
		if (config) {
			setDueDateWeeks(config.dueDateWeeks);
			setDirty(false);
		}
	}, [config]);

	if (!canEdit) return null;
	if (isEvalLoading || isConfigLoading) return null;

	return (
		<div className="mt-8 px-4">
			<div className="mb-3 flex items-center justify-between">
				<div>
					<h3 className="font-bold text-lg">Evaluator Dashboard</h3>
					<p className="text-muted-foreground text-sm">
						Configure the report tracking dashboard for one evaluator.
					</p>
				</div>
				<Button
					disabled={!dirty || setConfig.isPending}
					onClick={() => setConfig.mutate({ dueDateWeeks })}
					size="sm"
				>
					{setConfig.isPending ? "Saving..." : "Save"}
				</Button>
			</div>

			<div className="flex flex-col gap-4 rounded-md border p-4">
				<div className="flex items-center gap-3">
					<Label className="whitespace-nowrap" htmlFor="due-date-weeks">
						Due date weeks
					</Label>
					<Input
						className="w-20"
						id="due-date-weeks"
						max={52}
						min={1}
						onChange={(e) => {
							const n = Number.parseInt(e.target.value, 10);
							if (!Number.isNaN(n) && n >= 1 && n <= 52) {
								setDueDateWeeks(n);
								setDirty(true);
							}
						}}
						type="number"
						value={dueDateWeeks}
					/>
					<span className="text-muted-foreground text-sm">
						weeks after appointment (or last task date)
					</span>
				</div>

				<div className="flex flex-col gap-2">
					<Label className="font-medium text-sm">Dashboard evaluator</Label>
					<p className="mb-2 text-muted-foreground text-xs">
						Only one evaluator can be selected. Toggling one on will toggle
						others off.
					</p>
					<div className="flex flex-col gap-2">
						{evaluators?.map((ev) => (
							<div className="flex items-center gap-3" key={ev.npi}>
								<Switch
									checked={ev.evaluatorDashboard}
									disabled={setDashboardEvaluator.isPending}
									id={`ev-dashboard-${ev.npi}`}
									onCheckedChange={(checked) =>
										setDashboardEvaluator.mutate({
											npi: ev.npi,
											enabled: checked,
										})
									}
								/>
								<Label
									className="font-normal"
									htmlFor={`ev-dashboard-${ev.npi}`}
								>
									{ev.providerName}
								</Label>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
