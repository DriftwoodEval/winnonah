"use client";

import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { AddAsanaIdButton } from "~/app/_components/client/AddAsanaIdButton";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/app/_components/ui/popover";
import { Separator } from "~/app/_components/ui/separator";
import { Skeleton } from "~/app/_components/ui/skeleton";
import { asanaColorMap, getColorFromMap } from "~/lib/utils";
import type { Client } from "~/server/lib/utils";

interface ClientHeaderProps {
	client: Client | undefined;
	asanaProjectColorKey: string | null;
	onAsanaColorChange: (colorKey: string) => void;
	isLoading: boolean;
}

export function ClientHeader({
	client,
	asanaProjectColorKey,
	onAsanaColorChange,
	isLoading,
}: ClientHeaderProps) {
	const currentHexAsanaColor = asanaProjectColorKey
		? getColorFromMap(asanaProjectColorKey)
		: null;

	const [isPopoverOpen, setIsPopoverOpen] = useState(false);

	if (isLoading || !client) {
		return (
			<div className="flex flex-col gap-2">
				<Skeleton className="h-[var(--text-2xl)] w-[32ch] rounded-md" />
				<Skeleton className="h-[var(--text-base)] w-[9ch] rounded-md" />
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				{client && <h1 className="font-bold text-2xl">{client.fullName}</h1>}
				{!client.asanaId && <AddAsanaIdButton client={client} />}
			</div>
			<div className="flex h-5 items-center gap-2">
				<span>{client.id}</span>

				{client.interpreter && <Separator orientation="vertical" />}
				{client.interpreter && (
					<span className="font-bold">Interpreter Needed</span>
				)}

				{client.asdAdhd && <Separator orientation="vertical" />}
				{client.asdAdhd === "Both" ? (
					<span>ASD + ADHD</span>
				) : (
					client.asdAdhd && <span>{client.asdAdhd}</span>
				)}

				{currentHexAsanaColor && <Separator orientation="vertical" />}
				{currentHexAsanaColor && (
					<Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
						<PopoverTrigger asChild>
							<button
								className="h-5 w-5 cursor-pointer rounded-full"
								type="button"
								tabIndex={0}
								style={{ background: currentHexAsanaColor }}
								aria-label={`Current Asana color: ${asanaProjectColorKey}`}
							/>
						</PopoverTrigger>
						<PopoverContent className="w-auto p-2">
							<div className="grid grid-cols-4 place-items-center gap-2">
								{Object.entries(asanaColorMap).map(([key, value]) => (
									<button
										key={key}
										type="button"
										className="relative h-10 w-10 rounded-sm"
										style={{ backgroundColor: value }}
										onClick={() => {
											onAsanaColorChange(key);
											setIsPopoverOpen(false);
										}}
										aria-label={`Select Asana color: ${key}`}
									>
										{asanaProjectColorKey === key && (
											<CheckIcon
												className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2"
												style={{
													color:
														Number.parseInt(value.replace("#", ""), 16) >
														0xffffff / 2
															? "#333"
															: "#FFF",
												}}
											/>
										)}
									</button>
								))}
							</div>
						</PopoverContent>
					</Popover>
				)}
			</div>
		</div>
	);
}
