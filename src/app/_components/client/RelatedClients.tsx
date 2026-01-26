"use client";

import { Plus, User, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import type { SortedClient } from "~/lib/api-types";
import { api } from "~/trpc/react";
import { NameSearchInput } from "../clients/NameSearchInput";
import { SelectableClientsList } from "../clients/SelectableClientsList";
import { Button } from "../ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardHeader,
	CardTitle,
} from "../ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../ui/dialog";

interface RelatedClientsProps {
	clientId: number;
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
	relatedConnections,
	readOnly,
}: RelatedClientsProps) {
	const utils = api.useUtils();
	const [isAddOpen, setIsAddOpen] = useState(false);
	const [searchTerm, setSearchTerm] = useState("");
	const [selectedTarget, setSelectedTarget] = useState<SortedClient | null>(
		null,
	);

	const canEdit = useCheckPermission()("clients:related") && !readOnly;

	const { data: searchResults, isLoading: isSearching } =
		api.clients.search.useQuery(
			{
				nameSearch: searchTerm.length >= 3 ? searchTerm : undefined,
				excludeIds: [
					clientId,
					...(relatedConnections?.map((c) => c.relatedClientData.id) ?? []),
				],
			},
			{
				enabled: isAddOpen && searchTerm.length >= 3,
			},
		);

	const linkMutation = api.clients.linkRelated.useMutation({
		onSuccess: () => {
			toast.success("Clients linked");
			utils.clients.getOne.invalidate();
			setIsAddOpen(false);
			setSearchTerm("");
			setSelectedTarget(null);
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

	const handleLink = () => {
		if (selectedTarget) {
			linkMutation.mutate({ idA: clientId, idB: selectedTarget.id });
		}
	};

	const handleUnlink = (targetClientId: number) => {
		unlinkMutation.mutate({ idA: clientId, idB: targetClientId });
	};

	return (
		<Card className="w-full max-w-sm p-2">
			<CardHeader>
				<CardTitle className="text-sm">Related Clients</CardTitle>
				{canEdit && (
					<CardAction>
						<Dialog onOpenChange={setIsAddOpen} open={isAddOpen}>
							<DialogTrigger asChild>
								<Button size="icon-sm" variant="link">
									<Plus className="h-4 w-4" />
								</Button>
							</DialogTrigger>
							<DialogContent className="max-w-md">
								<DialogHeader>
									<DialogTitle>Link Related Client</DialogTitle>
								</DialogHeader>
								<div className="flex flex-col gap-4 py-4">
									<NameSearchInput
										initialValue={searchTerm}
										onDebouncedChange={setSearchTerm}
									/>
									<div className="min-h-[300px]">
										{searchTerm.length >= 3 ? (
											<SelectableClientsList
												clients={
													(searchResults?.clients as SortedClient[]) ?? []
												}
												onSelectionChange={setSelectedTarget}
												selectedClient={selectedTarget}
											/>
										) : (
											<div className="flex h-[300px] items-center justify-center rounded-md border border-dashed text-muted-foreground text-sm">
												Search for a client to link...
											</div>
										)}
									</div>
									<Button
										className="w-full"
										disabled={!selectedTarget || linkMutation.isPending}
										onClick={handleLink}
									>
										{linkMutation.isPending ? "Linking..." : "Link Client"}
									</Button>
								</div>
							</DialogContent>
						</Dialog>
					</CardAction>
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				{relatedConnections && relatedConnections.length > 0 ? (
					relatedConnections.map((conn) => (
						<div
							className="group flex items-center justify-between rounded-md border p-2 text-sm transition-colors hover:bg-muted/50"
							key={conn.relatedClientData.id}
						>
							<Link
								className="flex items-center gap-2 hover:underline"
								href={`/clients/${conn.relatedClientData.hash}`}
							>
								<User className="h-4 w-4 text-muted-foreground" />
								<span className="font-medium">
									{conn.relatedClientData.fullName}
								</span>
							</Link>
							{canEdit && (
								<Button
									className="opacity-0 group-hover:opacity-100"
									disabled={unlinkMutation.isPending}
									onClick={() => handleUnlink(conn.relatedClientData.id)}
									size="icon-sm"
									variant="ghost"
								>
									<X className="h-3 w-3" />
								</Button>
							)}
						</div>
					))
				) : (
					<p className="py-2 text-center text-muted-foreground text-xs italic">
						No related clients found.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
