"use client";

import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { api } from "~/trpc/react";

type Durations = Record<string, number>;

const DIAG_COLS = [
	{ key: "ASD", label: "ASD" },
	{ key: "ADHD", label: "ADHD" },
	{ key: "ASD+ADHD", label: "ASD+ADHD" },
	{ key: "ASD+LD", label: "ASD+LD" },
	{ key: "ADHD+LD", label: "ADHD+LD" },
	{ key: "LD", label: "LD" },
] as const;

const AGE_VARIANTS = [
	{ suffix: "", label: "" },
	{ suffix: "/young", label: " (≤6)" },
	{ suffix: "/older", label: " (7+)" },
] as const;

const APPT_TYPES = ["DA", "EVAL", "DAEVAL"] as const;

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
			return val !== undefined ? String(val / 60) : "";
		},
		[durations],
	);

	const setDuration = useCallback((key: string, raw: string) => {
		const hrs = Number.parseFloat(raw);
		setDurations((prev) => {
			const next = { ...prev };
			if (!raw || Number.isNaN(hrs) || hrs < 0) {
				delete next[key];
			} else {
				next[key] = Math.round(hrs * 60);
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
			step="0.5"
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
						Hours per appointment type used when an evaluator has no duration
						configured. Specific subtypes override DA/EVAL/DAEVAL, which
						override Default. Age-specific rows override the age-agnostic rows.
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
				<div className="grid min-w-[600px] grid-cols-8 items-center gap-x-2 gap-y-2 text-sm">
					{/* Column headers */}
					<div />
					<div className="text-center font-medium text-muted-foreground text-xs">
						(any)
					</div>
					{DIAG_COLS.map((d) => (
						<div
							className="text-center font-medium text-muted-foreground text-xs"
							key={d.key}
						>
							{d.label}
						</div>
					))}

					{/* Default rows */}
					{AGE_VARIANTS.map(({ suffix, label }) => (
						<>
							<div className="font-medium" key={`default-label${suffix}`}>
								Default{label}
							</div>
							{dInput(`default${suffix}`)}
							{/* no diagnosis subtypes for default */}
							{DIAG_COLS.map((d) => (
								<div key={`default${suffix}-${d.key}`} />
							))}
						</>
					))}

					{/* Appointment type rows */}
					{APPT_TYPES.map((type) =>
						AGE_VARIANTS.map(({ suffix, label }) => (
							<>
								<div className="font-medium" key={`${type}-label${suffix}`}>
									{type}
									{label}
								</div>
								{dInput(`${type}${suffix}`)}
								{DIAG_COLS.map((d) => (
									<span key={`${type}/${d.key}${suffix}`}>
										{dInput(`${type}/${d.key}${suffix}`)}
									</span>
								))}
							</>
						)),
					)}
				</div>
			</div>
		</div>
	);
}
