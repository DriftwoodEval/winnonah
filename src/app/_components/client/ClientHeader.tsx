"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@ui/context-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { Separator } from "@ui/separator";
import { Skeleton } from "@ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { CheckIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { toast } from "sonner";
import {
	CLIENT_COLOR_KEYS,
	CLIENT_COLOR_MAP,
	type ClientColor,
	formatColorName,
} from "~/lib/colors";
import { logger } from "~/lib/logger";
import type { Client } from "~/lib/types";
import { hasPermission } from "~/lib/utils";
import { api } from "~/trpc/react";
import { ResponsiveDialog } from "../shared/ResponsiveDialog";
import { AddDriveButton } from "./AddDrive";
import { ClientEditButton } from "./EditClientDialog";
import { EditDriveForm } from "./EditDriveForm";

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
	const utils = api.useUtils();

	const canMerge = session
		? hasPermission(session.user.permissions, "clients:merge")
		: false;
	const canColor = session
		? hasPermission(session.user.permissions, "clients:color")
		: false;
	const canDrive = session
		? hasPermission(session.user.permissions, "clients:drive")
		: false;
	const canShell = session
		? hasPermission(session.user.permissions, "clients:shell")
		: false;

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

	const updateClient = api.clients.update.useMutation({
		onSuccess: () => {
			toast.success("Client updated successfully!");
			utils.clients.getOne.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to update client", {
				description: error.message,
				duration: 10000,
			});
			log.error(error, "Failed to update client");
		},
	});

	const [isColorOpen, setIsColorOpen] = useState(false);
	const [editDriveOpen, setEditDriveOpen] = useState(false);

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

	const archiveClient = () =>
		updateClient.mutate({
			clientId: client.id,
			status: false,
		});

	const unarchiveClient = () =>
		updateClient.mutate({
			clientId: client.id,
			status: true,
		});

	return (
		<div className="flex w-full flex-col gap-4">
			<ResponsiveDialog
				description="Update the Google Drive folder link. The system will remove the Client ID from the old folder name and add it to the new folder name automatically."
				open={editDriveOpen}
				setOpen={setEditDriveOpen}
				title="Edit Drive"
			>
				<EditDriveForm
					client={client}
					editDriveDialog={{ open: editDriveOpen, setOpen: setEditDriveOpen }}
				/>
			</ResponsiveDialog>
			{client && (
				<div className="flex items-center gap-4">
					<h1 className="font-bold text-xl md:text-2xl">{client.fullName}</h1>
					<div className="flex h-[16px] items-center gap-2">
						{!readOnly && client.id.toString().length !== 5 && (
							<ClientEditButton client={client} />
						)}
						{!readOnly && !client.driveId && canDrive && (
							<>
								<Separator orientation="vertical" />
								<AddDriveButton client={client} />
							</>
						)}
						{!readOnly &&
							client.id.toString().length !== 5 &&
							client.driveId &&
							client.driveId !== "N/A" && <Separator orientation="vertical" />}
						{client.driveId && client.driveId !== "N/A" && (
							<ContextMenu>
								<ContextMenuTrigger>
									<Link
										href={`https://drive.google.com/open?id=${client.driveId}`}
										target="_blank"
									>
										<Image
											alt="Open Google Drive"
											className="dark:invert"
											height={16}
											src="/icons/google-drive.svg"
											width={16}
										/>
									</Link>
								</ContextMenuTrigger>
								<ContextMenuContent>
									<ContextMenuItem>
										<button
											onClick={() => setEditDriveOpen(true)}
											type="button"
										>
											Edit Drive
										</button>
									</ContextMenuItem>
								</ContextMenuContent>
							</ContextMenu>
						)}
					</div>
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
							? `Note Only${client.status ? "" : ", Archived"}`
							: client.status
								? "Active"
								: "Inactive"}
					</Badge>
					{client.highPriority && (
						<Badge variant="destructive">High Priority</Badge>
					)}
					{client.eiAttends && <Badge variant="secondary">EI Attends</Badge>}
				</div>

				{client.id.toString().length === 5 && !readOnly && canMerge && (
					<>
						<Separator orientation="vertical" />
						<Link href={`/clients/merge`}>
							<Button>Merge with Real Client</Button>
						</Link>
					</>
				)}

				{client.id.toString().length === 5 && !readOnly && canShell && (
					<>
						<Separator orientation="vertical" />
						{client.status === false ? (
							<Button onClick={unarchiveClient} variant="outline">
								Unarchive
							</Button>
						) : (
							<Button onClick={archiveClient} variant="destructive">
								Archive
							</Button>
						)}
					</>
				)}

				{(client.interpreter || punchInterp) && (
					<>
						<Separator orientation="vertical" />
						<span className="font-bold">Interpreter Needed</span>
					</>
				)}

				{(client.asdAdhd || punchFor) && (
					<>
						<Separator orientation="vertical" />
						<span>{punchFor ?? client.asdAdhd}</span>
					</>
				)}

				{client.id.toString().length !== 5 && currentHexColor && (
					<Separator orientation="vertical" />
				)}
				{client.id.toString().length !== 5 && currentHexColor && canColor ? (
					<Popover onOpenChange={setIsColorOpen} open={isColorOpen}>
						<PopoverTrigger asChild>
							<button
								aria-label={`Current color: ${formatColorName(selectedColor)}`}
								className="h-5 w-5 rounded-full"
								disabled={readOnly}
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
												aria-label={`Select color: ${formatColorName(
													colorKey,
												)}`}
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
			</div>
		</div>
	);
}
