"use client";

import { Button } from "@ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@ui/dialog";
import { Plus, User, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { ClientSearchAndAdd } from "../clients/ClientSearchAndAdd";

interface RelatedClientsProps {
	clientId: number;
	lastName: string;
	relatedConnections?: {
		relatedClientData: {
			id: number;
			fullName: string;
			hash: string;
		};
	}[];
	readOnly?: boolean;
}

export function RelatedClients({
	clientId,
	lastName,
	relatedConnections,
	readOnly,
}: RelatedClientsProps) {
	const utils = api.useUtils();
	const [isAddOpen, setIsAddOpen] = useState(false);

	const canEdit = useCheckPermission()("clients:related") && !readOnly;

	const linkMutation = api.clients.linkRelated.useMutation({
		onSuccess: () => {
			toast.success("Clients linked");
			utils.clients.getOne.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to link clients", {
				description: error.message,
			});
		},
	});

	const unlinkMutation = api.clients.unlinkRelated.useMutation({
		onSuccess: () => {
			toast.success("Clients unlinked");
			utils.clients.getOne.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to unlink clients", {
				description: error.message,
			});
		},
	});

	if (!canEdit && (!relatedConnections || relatedConnections.length === 0)) {
		return null;
	}

	const handleUnlink = (targetClientId: number) => {
		unlinkMutation.mutate({ idA: clientId, idB: targetClientId });
	};

	return (
		<Card className="w-full max-w-sm gap-2 rounded-md p-1">
			<CardHeader className="flex flex-row items-center justify-between px-4 py-2">
				<CardTitle className="font-semibold text-sm">Related Clients</CardTitle>
				{canEdit && (
					<CardAction>
						<Dialog onOpenChange={setIsAddOpen} open={isAddOpen}>
							<DialogTrigger asChild>
								<Button
									className="cursor-pointer"
									size="icon-sm"
									variant="ghost"
								>
									<Plus className="h-4 w-4" />
								</Button>
							</DialogTrigger>
							<DialogContent className="max-w-md">
								<DialogHeader>
									<DialogTitle>Link Related Client</DialogTitle>
								</DialogHeader>
								<div className="flex flex-col gap-4 py-4">
									<ClientSearchAndAdd
										addButtonLabel="Link"
										excludeIds={[
											clientId,
											...(relatedConnections?.map(
												(c) => c.relatedClientData.id,
											) ?? []),
										]}
										initialSearchTerm={lastName}
										isAdding={linkMutation.isPending}
										onAdd={(client) =>
											linkMutation.mutate({ idA: clientId, idB: client.id })
										}
										placeholder="Search for a client to link..."
									/>
								</div>
							</DialogContent>
						</Dialog>
					</CardAction>
				)}
			</CardHeader>
			{relatedConnections && relatedConnections.length > 0 && (
				<CardContent className="flex flex-col gap-1 px-2 pb-2">
					{relatedConnections &&
						relatedConnections.length > 0 &&
						relatedConnections.map((conn) => (
							<div
								className="group relative flex items-center rounded-md border bg-muted/30 text-sm transition-colors hover:bg-muted/60"
								key={conn.relatedClientData.id}
							>
								<Link
									className={cn(
										"flex flex-1 items-center gap-2 overflow-hidden p-2",
										canEdit && "pr-9",
									)}
									href={`/clients/${conn.relatedClientData.hash}`}
								>
									<User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
									<span className="truncate font-medium group-hover:underline">
										{conn.relatedClientData.fullName}
									</span>
								</Link>
								{canEdit && (
									<Button
										className="absolute right-1 h-7 w-7 cursor-pointer opacity-100 transition-all hover:bg-destructive! hover:text-white lg:opacity-0 lg:group-hover:opacity-100"
										disabled={unlinkMutation.isPending}
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											handleUnlink(conn.relatedClientData.id);
										}}
										size="icon"
										variant="ghost"
									>
										<X className="h-3.5 w-3.5" />
									</Button>
								)}
							</div>
						))}
				</CardContent>
			)}
		</Card>
	);
}
