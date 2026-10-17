"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { toast } from "sonner";
import { USER_COLORS } from "~/lib/user-colors";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

/** Color swatches for one evaluator. Colors held by another evaluator are disabled. */
export function ColorPicker({ npi }: { npi: number }) {
	const utils = api.useUtils();
	const { data: evaluators } = api.evaluators.getColors.useQuery();
	const setColor = api.evaluators.setColor.useMutation({
		onSuccess: () => {
			void utils.evaluators.getColors.invalidate();
			void utils.evaluators.getAll.invalidate();
		},
		onError: (error) => toast.error(error.message),
	});

	const target = evaluators?.find((ev) => ev.npi === npi);
	if (!target) return null;

	return (
		<div className="px-1.5 py-1">
			<p className="mb-1 text-sm">Color</p>
			<div className="flex flex-wrap gap-1.5">
				{USER_COLORS.map((c, i) => {
					const holder = evaluators?.find((ev) => ev.color === i);
					const takenByOther = !!holder && holder.npi !== target.npi;
					return (
						<button
							aria-label={`Color ${i + 1}`}
							aria-pressed={target.color === i}
							className={cn(
								"h-5 w-5 rounded-full border",
								c.swatch,
								target.color === i && "ring-2 ring-ring ring-offset-1",
								takenByOther && "cursor-not-allowed opacity-25",
							)}
							disabled={takenByOther}
							key={c.swatch}
							onClick={() =>
								setColor.mutate({
									npi: target.npi,
									color: target.color === i ? null : i,
								})
							}
							title={
								takenByOther ? `Used by ${holder.providerName}` : undefined
							}
							type="button"
						/>
					);
				})}
			</div>
		</div>
	);
}

/** Table cell content: the evaluator's color dot, opening the picker for admins. */
export function ColorCell({
	npi,
	color,
	canEdit,
}: {
	npi: number;
	color: number | null;
	canEdit: boolean;
}) {
	const dot = (
		<span
			className={cn(
				"block h-5 w-5 rounded-full border",
				color === null ? "border-dashed" : USER_COLORS[color]?.swatch,
			)}
		/>
	);
	if (!canEdit) return dot;
	return (
		<Popover>
			<PopoverTrigger aria-label="Change color" className="rounded-full">
				{dot}
			</PopoverTrigger>
			<PopoverContent className="w-56 p-1">
				<ColorPicker npi={npi} />
			</PopoverContent>
		</Popover>
	);
}
