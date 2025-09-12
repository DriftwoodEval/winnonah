"use client";

import { Badge } from "@ui/badge";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { subYears } from "date-fns";
import { CheckIcon } from "lucide-react";
import Link from "next/link";
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
import { ClientEditButton } from "./EditClientDialog";

interface ClientHeaderProps {
	client: Client | undefined;
	selectedColor: ClientColor | null;
	onColorChange: (color: ClientColor) => void;
	isLoading: boolean;
	readOnly?: boolean;
}

const log = logger.child({ module: "ClientHeader" });

export function ClientHeader({
	client,
	selectedColor,
	onColorChange,
	isLoading,
	readOnly,
}: ClientHeaderProps) {
	const { data: session } = useSession();
	const admin = session ? checkRole(session.user.role, "admin") : false;

	const utils = api.useUtils();

	const BNAgeOutDate = subYears(new Date(), 3);

	const showBabyNetCheckbox =
		client &&
		client.dob > BNAgeOutDate &&
		client.primaryInsurance !== "BabyNet" &&
		client.secondaryInsurance !== "BabyNet";

	const { data: punchFor } = api.google.getFor.useQuery(
		String(client?.id) ?? "",
		{
			enabled: !!client?.id,
		},
	);

	const { data: punchInterp } = api.google.getLang.useQuery(
		String(client?.id) ?? "",
		{
			enabled: !!client?.id,
		},
	);

	const [isColorOpen, setIsColorOpen] = useState(false);
	const [isHPOpen, setIsHPOpen] = useState(false);
	const [isBabyNetOpen, setIsBabyNetOpen] = useState(false);

	const highPriorityId = useId();
	const babyNetId = useId();

	// TODO: Add checkbox for BabyNet that will show up in sort, for not technically being insurance on TA

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

	function onBabyNetChange() {
		if (client) {
			editClient.mutate({
				clientId: client.id,
				babyNet: !client.babyNet,
			});
			utils.clients.getOne.invalidate();
		}
	}

	if (isLoading || !client) {
		return (
			<div className="flex w-full flex-col gap-2">
				<Skeleton className="h-[var(--text-2xl)] w-[18ch] rounded-md" />
				<Skeleton className="h-[var(--text-base)] w-[8ch] rounded-md" />
			</div>
		);
	}

	selectedColor ??= "gray";

	const currentHexColor = selectedColor
		? CLIENT_COLOR_MAP[selectedColor]
		: null;

	return (
		<div className="flex w-full flex-col gap-2">
			{client && (
				<div className="flex items-center gap-2">
					<h1 className="font-bold text-2xl">{client.fullName}</h1>
					{admin && !readOnly && client.id.toString().length !== 5 && (
						<ClientEditButton client={client} />
					)}
				</div>
			)}
			<div className="flex h-5 items-center gap-2">
				<div className="flex items-center gap-2">
					{client.id.toString().length !== 5 && <span>{client.id}</span>}
					<Badge
						variant={
							client.id.toString().length === 5
								? "outline"
								: client.status
									? "default"
									: "destructive"
						}
					>
						{client.id.toString().length === 5
							? "Note Only"
							: client.status
								? "Active"
								: "Inactive"}
					</Badge>
				</div>

				{client.id.toString().length === 5 && !readOnly && (
					<>
						<Separator orientation="vertical" />
						<Link href={`/clients/merge`}>
							<Button disabled={!admin}>Merge with Real Client</Button>
						</Link>
					</>
				)}

				{(client.interpreter || punchInterp) && (
					<Separator orientation="vertical" />
				)}
				{(client.interpreter || punchInterp) && (
					<span className="font-bold">Interpreter Needed</span>
				)}

				{(client.asdAdhd || punchFor) && <Separator orientation="vertical" />}
				{(client.asdAdhd || punchFor) && (
					<span>{punchFor ?? client.asdAdhd}</span>
				)}

				{client.id.toString().length !== 5 && currentHexColor && (
					<Separator orientation="vertical" />
				)}
				{client.id.toString().length !== 5 && currentHexColor && admin ? (
					<Popover onOpenChange={setIsColorOpen} open={isColorOpen}>
						<PopoverTrigger asChild>
							<button
								aria-label={`Current color: ${formatColorName(selectedColor)}`}
								className="h-5 w-5 rounded-full"
								disabled={!admin || readOnly}
								style={{ background: currentHexColor }}
								tabIndex={0}
								type="button"
							/>
						</PopoverTrigger>
						<PopoverContent className="w-auto p-2">
							<div className="grid grid-cols-6 gap-2 pt-1">
								{CLIENT_COLOR_KEYS.map((colorKey) => (
									<Tooltip key={colorKey}>
										<TooltipTrigger asChild>
											<button
												aria-label={`Select color: ${formatColorName(colorKey)}`}
												className="relative flex h-8 w-8 items-center justify-center rounded-sm text-sm"
												key={colorKey}
												onClick={() => {
													onColorChange(colorKey);
													setIsColorOpen(false);
												}}
												style={{
													color:
														Number.parseInt(
															CLIENT_COLOR_MAP[colorKey].replace("#", ""),
															16,
														) >
														0xffffff / 2
															? "#333"
															: "#FFF",
													backgroundColor: CLIENT_COLOR_MAP[colorKey],
												}}
												type="button"
											>
												{selectedColor === colorKey && <CheckIcon />}
											</button>
										</TooltipTrigger>
										<TooltipContent
											arrowClassName="bg-background fill-background"
											className="bg-background text-foreground"
										>
											<p>{formatColorName(colorKey)}</p>
										</TooltipContent>
									</Tooltip>
								))}
							</div>
						</PopoverContent>
					</Popover>
				) : client.id.toString().length !== 5 && currentHexColor ? (
					<button
						aria-label={`Current color: ${formatColorName(selectedColor)}`}
						className="h-5 w-5 rounded-full"
						style={{ background: currentHexColor }}
						tabIndex={0}
						type="button"
					/>
				) : null}

				{client.id.toString().length !== 5 && (
					<>
						<Separator orientation="vertical" />
						<div
							className={cn(
								"flex items-center gap-2",
								!client.highPriority && "text-muted-foreground",
							)}
						>
							<Checkbox
								checked={client.highPriority}
								disabled={!admin || readOnly}
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
					</>
				)}

				{client.id.toString().length !== 5 && showBabyNetCheckbox && (
					<>
						<Separator orientation="vertical" />
						<div
							className={cn(
								"flex items-center gap-2",
								!client.babyNet && "text-muted-foreground",
							)}
						>
							<Checkbox
								checked={client.babyNet}
								disabled={!admin || readOnly}
								id={babyNetId}
								onClick={() => setIsBabyNetOpen(true)}
							/>
							<Label htmlFor={babyNetId}>BabyNet</Label>
							<Dialog onOpenChange={setIsBabyNetOpen} open={isBabyNetOpen}>
								<DialogContent>
									<DialogHeader>
										<DialogTitle>Set BabyNet</DialogTitle>
										<DialogDescription>
											{client.babyNet
												? "Unset client as BabyNet?"
												: "Set client as BabyNet?"}
										</DialogDescription>
									</DialogHeader>
									<DialogFooter>
										<Button
											disabled={!admin}
											onClick={() => {
												onBabyNetChange();
												setIsBabyNetOpen(false);
											}}
										>
											{client.babyNet ? "Unset" : "Set"}
										</Button>
									</DialogFooter>
								</DialogContent>
							</Dialog>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
