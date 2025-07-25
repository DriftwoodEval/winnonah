"use client";

import { Button } from "@components/ui/button";
import { Checkbox } from "@components/ui/checkbox";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@components/ui/radio-group";
import { ScrollArea } from "@components/ui/scroll-area";
import { Separator } from "@components/ui/separator";
import { Filter } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useContext, useEffect, useMemo, useState } from "react";
import { ClientLoadingContext } from "~/app/_context/ClientLoadingContext";
import type { AsanaProject } from "~/server/lib/types";
import { api } from "~/trpc/react";
import { ClientListItem } from "./clients/ClientListItem";

export function ClientsList() {
	const clients = api.clients.getSorted.useQuery();
	const { setClientsLoaded } = useContext(ClientLoadingContext);

	useEffect(() => {
		if (clients.isSuccess) {
			setClientsLoaded(true);
		}
	}, [clients.isSuccess, setClientsLoaded]);

	const asanaProjects = api.asana.getAllProjects.useQuery(undefined, {
		enabled: !!clients.data, // Wait for clients.data to load
	});

	const searchParams = useSearchParams();
	const [searchInput, setSearchInput] = useState("");

	let initiallyFilteredClients = clients.data ?? [];

	const evalParam = searchParams.get("eval") ?? "";
	const evalNumber = Number.parseInt(evalParam, 10);

	const evalClients = api.clients.getByNpi.useQuery(evalNumber, {
		enabled: !Number.isNaN(evalNumber),
	});

	if (evalClients.data) {
		initiallyFilteredClients = evalClients.data;
	}

	if (searchParams.get("office")) {
		initiallyFilteredClients = initiallyFilteredClients.filter(
			(client) => client.closestOffice === searchParams.get("office"),
		);
	}

	const [hideBabyNet, setHideBabyNet] = useState(false);
	const [statusFilter, setStatusFilter] = useState<
		"active" | "inactive" | "all"
	>("active");

	const filteredClients = useMemo(() => {
		let clients = initiallyFilteredClients;

		if (searchInput) {
			clients = clients.filter((client) =>
				client.fullName?.toLowerCase().includes(searchInput.toLowerCase()),
			);
		}

		if (hideBabyNet) {
			const babyNetClients = clients.filter((client) => {
				return (
					client.primaryInsurance === "BabyNet" ||
					client.secondaryInsurance === "BabyNet"
				);
			});

			clients = clients.filter((client) => !babyNetClients.includes(client));
		}

		if (statusFilter === "active") {
			clients = clients.filter((client) => client.status);
		} else if (statusFilter === "inactive") {
			clients = clients.filter((client) => !client.status);
		}

		return clients;
	}, [initiallyFilteredClients, searchInput, hideBabyNet, statusFilter]);

	const handleBabyNetCheckboxClick = () => {
		setHideBabyNet(!hideBabyNet);
	};

	const handleStatusFilterClick = (status: "active" | "inactive" | "all") => {
		setStatusFilter(status);
	};

	const asanaProjectMap = useMemo(() => {
		if (!asanaProjects.data) {
			return undefined;
		}

		return new Map<string, AsanaProject>(
			asanaProjects.data.map((project: AsanaProject) => [project.gid, project]),
		);
	}, [asanaProjects.data]);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-row gap-3">
				<Input
					onChange={(e) => setSearchInput(e.target.value)}
					placeholder="Search by name"
					value={searchInput}
				/>
				<Popover>
					<PopoverTrigger asChild>
						<Button variant="outline">
							<Filter />
						</Button>
					</PopoverTrigger>
					<PopoverContent align="end">
						<Label className="w-full" htmlFor="hide-babynet">
							<Checkbox
								checked={hideBabyNet}
								id="hide-babynet"
								onCheckedChange={handleBabyNetCheckboxClick}
							/>
							Hide BabyNet
						</Label>
						<Separator className="my-2" orientation="horizontal" />
						<p className="mb-2">Client Status</p>
						<RadioGroup
							className="w-full"
							onValueChange={handleStatusFilterClick}
							value={statusFilter}
						>
							<Label className="w-full" htmlFor="status-active">
								<RadioGroupItem id="status-active" value="active" />
								Active
							</Label>
							<Label className="w-full" htmlFor="status-inactive">
								<RadioGroupItem id="status-inactive" value="inactive" />
								Inactive
							</Label>
							<Label className="w-full" htmlFor="status-all">
								<RadioGroupItem id="status-all" value="all" />
								All
							</Label>
						</RadioGroup>
					</PopoverContent>
				</Popover>
			</div>
			<ScrollArea className="dark h-72 w-full rounded-md border bg-card text-card-foreground">
				<div className="p-4">
					<h4 className="mb-4 font-medium text-sm leading-none">Clients</h4>

					{filteredClients.map((client, index) => (
						<div key={client.hash}>
							<ClientListItem
								asanaProjectMap={asanaProjectMap}
								client={client}
							/>
							{index < filteredClients.length - 1 && (
								<Separator className="my-2" />
							)}
						</div>
					))}
				</div>
			</ScrollArea>
		</div>
	);
}
