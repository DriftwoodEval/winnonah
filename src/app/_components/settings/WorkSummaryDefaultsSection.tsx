"use client";

import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { api } from "~/trpc/react";

type Durations = Record<string, number>;

const DIAG_COLS = [
	{ key: "ASD", label: "ASD" },
	{ key: "ADHD", label: "ADHD" },
	{ key: "ASD+LD", label: "ASD+LD" },
	{ key: "ADHD+LD", label: "ADHD+LD" },
	{ key: "LD", label: "LD" },
] as const;

const EVAL_AGE_VARIANTS = [
	{ suffix: "/young", label: " (≤6)" },
	{ suffix: "/older", label: " (7+)" },
] as const;

function DurationInput({
	value,
	onChange,
	disabled,
	placeholder,
}: {
	value: string;
	onChange: (raw: string) => void;
	disabled?: boolean;
	placeholder?: string;
}) {
	const ref = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (el && document.activeElement !== el) {
			el.value = value;
		}
	}, [value]);

	return (
		<Input
			className="h-8 text-center text-sm"
			defaultValue={value}
			disabled={disabled}
			min={0}
			onBlur={(e) => {
				const hrs = parseFloat(e.target.value);
				if (!e.target.value || Number.isNaN(hrs) || hrs < 0) {
					if (ref.current) ref.current.value = "";
					onChange("");
				} else {
					const rounded = Math.round(hrs * 2) / 2;
					if (ref.current) ref.current.value = String(rounded);
					onChange(String(rounded));
				}
			}}
			onChange={(e) => onChange(e.target.value)}
			onKeyDown={(e) => {
				if (
					e.key.length === 1 &&
					!/[\d.]/.test(e.key) &&
					!e.ctrlKey &&
					!e.metaKey
				) {
					e.preventDefault();
				}
			}}
			placeholder={placeholder}
			ref={ref}
			step={0.5}
			type="number"
		/>
	);
}

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
		<DurationInput
			disabled={!canEdit}
			onChange={(raw) => setDuration(key, raw)}
			placeholder="—"
			value={getDuration(key)}
		/>
	);

	if (isLoading) return null;

	return (
		<div className="mt-8 px-4">
			<div className="mb-3 flex items-center justify-between">
				<div>
					<h3 className="font-bold text-lg">Default Appointment Durations</h3>
					<p className="text-muted-foreground text-sm">
						Hours per appointment type used when an evaluator has no duration
						configured.
					</p>
				</div>
				{canEdit && (
					<Button
						disabled={!dirty || setDefaults.isPending}
						onClick={() => {
							const cleaned = Object.fromEntries(
								Object.entries(durations).filter(
									([k]) =>
										!k.startsWith("DA/") &&
										!k.startsWith("default") &&
										!k.includes("ASD+ADHD") &&
										k !== "EVAL" &&
										k !== "DAEVAL",
								),
							);
							setDefaults.mutate(cleaned);
						}}
						size="sm"
					>
						{setDefaults.isPending ? "Saving..." : "Save"}
					</Button>
				)}
			</div>

			<div className="overflow-x-auto rounded-md border p-3">
				<div className="grid min-w-[600px] grid-cols-7 items-center gap-x-2 gap-y-2 text-sm">
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

					<div className="font-medium">DA</div>
					{dInput("DA")}
					{DIAG_COLS.map((d) => (
						<div key={`da-empty-${d.key}`} />
					))}

					{(["EVAL", "DAEVAL"] as const).map((type) =>
						EVAL_AGE_VARIANTS.map(({ suffix, label }) => (
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
