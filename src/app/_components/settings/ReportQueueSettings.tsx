"use client";

import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { api } from "~/trpc/react";

export default function ReportQueueSettings() {
	const can = useCheckPermission();
	const canEdit = can("reports:approve");

	const { data, isLoading } = api.reportQueue.getConfig.useQuery(undefined, {
		enabled: canEdit,
	});
	const utils = api.useUtils();

	const setConfig = api.reportQueue.setConfig.useMutation({
		onSuccess: () => {
			toast.success("Report queue settings saved.");
			void utils.reportQueue.getConfig.invalidate();
		},
		onError: (err) =>
			toast.error("Failed to save settings", { description: err.message }),
	});

	const [value, setValue] = useState<number>(1);
	const [firstReviewLabel, setFirstReviewLabel] = useState("AJP review");
	const [secondReviewLabel, setSecondReviewLabel] = useState("MCS review");
	const [dirty, setDirty] = useState(false);

	useEffect(() => {
		if (data) {
			setValue(data.defaultMaxClaimedReports);
			setFirstReviewLabel(data.firstReviewLabel);
			setSecondReviewLabel(data.secondReviewLabel);
			setDirty(false);
		}
	}, [data]);

	if (!canEdit) return null;
	if (isLoading) return null;

	return (
		<div className="mt-8 px-4">
			<div className="mb-3 flex items-center justify-between">
				<div>
					<h3 className="font-bold text-lg">Report Queue</h3>
					<p className="text-muted-foreground text-sm">
						Default maximum number of reports a user can have claimed at once.
						Individual users can have their own override set in their account
						settings.
					</p>
				</div>
				<Button
					disabled={!dirty || setConfig.isPending}
					onClick={() =>
						setConfig.mutate({
							defaultMaxClaimedReports: value,
							firstReviewLabel: firstReviewLabel.trim() || "Review 1",
							secondReviewLabel: secondReviewLabel.trim() || "Review 2",
						})
					}
					size="sm"
				>
					{setConfig.isPending ? "Saving..." : "Save"}
				</Button>
			</div>

			<div className="flex flex-col gap-3 rounded-md border p-4">
				<div className="flex items-center gap-3">
					<Label className="whitespace-nowrap" htmlFor="default-max-claimed">
						Default max claimed reports
					</Label>
					<Input
						className="w-24"
						id="default-max-claimed"
						max={10}
						min={1}
						onChange={(e) => {
							const num = Number.parseInt(e.target.value, 10);
							if (!Number.isNaN(num) && num >= 1 && num <= 10) {
								setValue(num);
								setDirty(true);
							}
						}}
						type="number"
						value={value}
					/>
				</div>
				<div className="flex items-center gap-3">
					<Label className="whitespace-nowrap" htmlFor="first-review-label">
						First review label
					</Label>
					<Input
						className="w-48"
						id="first-review-label"
						onChange={(e) => {
							setFirstReviewLabel(e.target.value);
							setDirty(true);
						}}
						value={firstReviewLabel}
					/>
					<Label className="whitespace-nowrap" htmlFor="second-review-label">
						Second review label
					</Label>
					<Input
						className="w-48"
						id="second-review-label"
						onChange={(e) => {
							setSecondReviewLabel(e.target.value);
							setDirty(true);
						}}
						value={secondReviewLabel}
					/>
				</div>
			</div>
		</div>
	);
}
