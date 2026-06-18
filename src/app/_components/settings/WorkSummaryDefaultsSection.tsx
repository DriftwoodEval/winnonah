"use client";

import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { api } from "~/trpc/react";

type Durations = Record<string, number>;

const DURATION_KEYS = [
	{ key: "default", label: "Default", subtypes: [] as string[] },
	{ key: "DA", label: "DA", subtypes: ["DA/ASD", "DA/ADHD", "DA/ASD+ADHD"] },
	{
		key: "EVAL",
		label: "EVAL",
		subtypes: ["EVAL/ASD", "EVAL/ADHD", "EVAL/ASD+ADHD"],
	},
	{
		key: "DAEVAL",
		label: "DAEVAL",
		subtypes: ["DAEVAL/ASD", "DAEVAL/ADHD", "DAEVAL/ASD+ADHD"],
	},
] as const;

export default function WorkSummaryDefaultsSection() {
	const can = useCheckPermission();
	const canEdit = can("settings:evaluators");

	const { data: saved, isLoading } = api.workSummary.getDefaults.useQuery();
	const utils = api.useUtils();

	const setDefaults = api.workSummary.setDefaults.useMutation({
		onSuccess: () => {
			toast.success("Default durations saved.");
			utils.workSummary.getDefaults.invalidate();
		},
		onError: (err) =>
			toast.error("Failed to save defaults", { description: err.message }),
	});

	const [durations, setDurations] = useState<Durations>({});
	const [dirty, setDirty] = useState(false);

	useEffect(() => {
		if (saved) {
			setDurations(saved);
			setDirty(false);
		}
	}, [saved]);

	const getDuration = useCallback(
		(key: string): string => {
			const val = durations[key];
			return val !== undefined ? String(val) : "";
		},
		[durations],
	);

	const setDuration = useCallback((key: string, raw: string) => {
		const num = Number.parseInt(raw, 10);
		setDurations((prev) => {
			const next = { ...prev };
			if (!raw || Number.isNaN(num) || num < 0) {
				delete next[key];
			} else {
				next[key] = num;
			}
			return next;
		});
		setDirty(true);
	}, []);

	const dInput = (key: string) => (
		<Input
			className="h-8 text-center text-sm"
			disabled={!canEdit}
			min="0"
			onChange={(e) => setDuration(key, e.target.value)}
			placeholder="—"
			type="number"
			value={getDuration(key)}
		/>
	);

	if (isLoading) return null;

	return (
		<div className="mt-8 px-4">
			<div className="mb-3 flex items-center justify-between">
				<div>
					<h3 className="font-bold text-lg">
						Work Summary - Default Durations
					</h3>
					<p className="text-muted-foreground text-sm">
						Minutes per appointment type used when an evaluator has no duration
						configured. Specific subtypes override DA/EVAL/DAEVAL, which
						override Default.
					</p>
				</div>
				{canEdit && (
					<Button
						disabled={!dirty || setDefaults.isPending}
						onClick={() => setDefaults.mutate(durations)}
						size="sm"
					>
						{setDefaults.isPending ? "Saving..." : "Save"}
					</Button>
				)}
			</div>

			<div className="overflow-x-auto rounded-md border p-3">
				<div className="grid min-w-[380px] grid-cols-5 items-center gap-x-2 gap-y-2 text-sm">
					<div />
					<div className="text-center font-medium text-muted-foreground text-xs">
						(any)
					</div>
					<div className="text-center font-medium text-muted-foreground text-xs">
						ASD
					</div>
					<div className="text-center font-medium text-muted-foreground text-xs">
						ADHD
					</div>
					<div className="text-center font-medium text-muted-foreground text-xs">
						ASD+ADHD
					</div>

					<div className="font-medium">Default</div>
					{dInput("default")}
					<div />
					<div />
					<div />

					{DURATION_KEYS.filter((r) => r.key !== "default").map((row) => (
						<>
							<div className="font-medium" key={`label-${row.key}`}>
								{row.label}
							</div>
							{dInput(row.key)}
							{row.subtypes.map((sub) => (
								<span key={sub}>{dInput(sub)}</span>
							))}
						</>
					))}
				</div>
			</div>
		</div>
	);
}
