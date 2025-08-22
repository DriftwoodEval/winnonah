"use client";

import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/dialog";
import { Label } from "@ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { Separator } from "@ui/separator";
import { Skeleton } from "@ui/skeleton";
import { CheckIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
	CLIENT_COLOR_KEYS,
	CLIENT_COLOR_MAP,
	type ClientColor,
	formatColorName,
} from "~/lib/colors";
import { logger } from "~/lib/logger";
import { checkRole, cn } from "~/lib/utils";
import type { Client } from "~/server/lib/types";
import { api } from "~/trpc/react";

interface ClientHeaderProps {
	client: Client | undefined;
	selectedColor: ClientColor | null;
	onColorChange: (color: ClientColor) => void;
	isLoading: boolean;
}

const log = logger.child({ module: "ClientHeader" });

export function ClientHeader({
	client,
	selectedColor,
	onColorChange,
	isLoading,
}: ClientHeaderProps) {
	const { data: session } = useSession();
	const admin = session ? checkRole(session.user.role, "admin") : false;

	const utils = api.useUtils();

	const [isColorOpen, setIsColorOpen] = useState(false);
	const [isHPOpen, setIsHPOpen] = useState(false);

	const highPriorityId = useId();

	const editClient = api.clients.update.useMutation({
		onSuccess: () => {
			setIsColorOpen(false);
		},
		onError: (error) => {
			log.error(error, "Failed to update client");
			toast.error("Failed to update client", { description: error.message });
		},
	});

	function onHighPriorityChange() {
		if (client) {
			editClient.mutate({
				clientId: client.id,
				highPriority: !client.highPriority,
			});
			utils.clients.getOne.invalidate();
		}
	}

	if (isLoading || !client) {
		return (
			<div className="flex flex-col gap-2">
				<Skeleton className="h-[var(--text-2xl)] w-[32ch] rounded-md" />
				<Skeleton className="h-[var(--text-base)] w-[9ch] rounded-md" />
			</div>
		);
	}

	selectedColor ??= "none";

	const currentHexColor = selectedColor
		? CLIENT_COLOR_MAP[selectedColor]
		: null;

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				{client && <h1 className="font-bold text-2xl">{client.fullName}</h1>}
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

				{currentHexColor && <Separator orientation="vertical" />}
				{currentHexColor && admin ? (
					<Popover onOpenChange={setIsColorOpen} open={isColorOpen}>
						<PopoverTrigger asChild>
							<button
								aria-label={`Current color: ${formatColorName(selectedColor)}`}
								className="h-5 w-5 cursor-pointer rounded-full"
								style={{ background: currentHexColor }}
								tabIndex={0}
								type="button"
							/>
						</PopoverTrigger>
						<PopoverContent className="w-auto p-2">
							<div className="grid grid-cols-4 place-items-center gap-2">
								{CLIENT_COLOR_KEYS.map((colorKey) => (
									<button
										aria-label={`Select color: ${formatColorName(colorKey)}`}
										className="relative h-10 w-10 rounded-sm"
										key={colorKey}
										onClick={() => {
											onColorChange(colorKey);
											setIsColorOpen(false);
										}}
										style={{ backgroundColor: CLIENT_COLOR_MAP[colorKey] }}
										type="button"
									>
										{selectedColor === colorKey && (
											<CheckIcon
												className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2"
												style={{
													color:
														Number.parseInt(colorKey.replace("#", ""), 16) >
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
				) : currentHexColor ? (
					<button
						aria-label={`Current color: ${formatColorName(selectedColor)}`}
						className="h-5 w-5 rounded-full"
						style={{ background: currentHexColor }}
						tabIndex={0}
						type="button"
					/>
				) : null}

				<Separator orientation="vertical" />
				<div
					className={cn(
						"flex items-center gap-2",
						!client.highPriority && "text-muted-foreground",
					)}
				>
					<Checkbox
						// disabled={!admin}
						checked={client.highPriority}
						id={highPriorityId}
						onClick={() => setIsHPOpen(true)}
					/>
					<Label htmlFor={highPriorityId}>High Priority</Label>
					<Dialog onOpenChange={setIsHPOpen} open={isHPOpen}>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Change Priority</DialogTitle>
								<DialogDescription>
									{client.highPriority
										? "Remove client from high priority list?"
										: "Add client to high priority list?"}
								</DialogDescription>
							</DialogHeader>
							<DialogFooter>
								<Button
									disabled={!admin}
									onClick={() => {
										onHighPriorityChange();
										setIsHPOpen(false);
									}}
								>
									{client.highPriority ? "Remove" : "Add"}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</div>
			</div>
		</div>
	);
}
