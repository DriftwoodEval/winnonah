"use client";

import { AddAsanaIdButton } from "@components/client/AddAsanaIdButton";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@components/ui/popover";
import { Separator } from "@components/ui/separator";
import { Skeleton } from "@components/ui/skeleton";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { asanaColorMap, getColorFromMap } from "~/lib/utils";
import type { Client } from "~/server/lib/types";

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
					<Popover onOpenChange={setIsPopoverOpen} open={isPopoverOpen}>
						<PopoverTrigger asChild>
							<button
								aria-label={`Current Asana color: ${asanaProjectColorKey}`}
								className="h-5 w-5 cursor-pointer rounded-full"
								style={{ background: currentHexAsanaColor }}
								tabIndex={0}
								type="button"
							/>
						</PopoverTrigger>
						<PopoverContent className="w-auto p-2">
							<div className="grid grid-cols-4 place-items-center gap-2">
								{Object.entries(asanaColorMap).map(([key, value]) => (
									<button
										aria-label={`Select Asana color: ${key}`}
										className="relative h-10 w-10 rounded-sm"
										key={key}
										onClick={() => {
											onAsanaColorChange(key);
											setIsPopoverOpen(false);
										}}
										style={{ backgroundColor: value }}
										type="button"
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
