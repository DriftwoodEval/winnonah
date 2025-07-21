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
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { cn, formatClientAge, getColorFromMap } from "~/lib/utils";
import { api } from "~/trpc/react";

export function ClientsList() {
	const clients = api.clients.getSorted.useQuery();
	const asanaProjects = api.asana.getAllProjects.useQuery();

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
		if (!asanaProjects.data || asanaProjects.data.length === 0) {
			return new Map();
		}

		return new Map(asanaProjects.data.map((project) => [project.gid, project]));
	}, [asanaProjects.data]);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-row gap-3">
				<Input
					placeholder="Search by name"
					value={searchInput}
					onChange={(e) => setSearchInput(e.target.value)}
				/>
				<Popover>
					<PopoverTrigger asChild>
						<Button variant="outline">
							<Filter />
						</Button>
					</PopoverTrigger>
					<PopoverContent align="end">
						<Label htmlFor="hide-babynet" className="w-full">
							<Checkbox
								id="hide-babynet"
								checked={hideBabyNet}
								onCheckedChange={handleBabyNetCheckboxClick}
							/>
							Hide BabyNet
						</Label>
						<Separator orientation="horizontal" className="my-2" />
						<p className="mb-2">Client Status</p>
						<RadioGroup
							className="w-full"
							value={statusFilter}
							onValueChange={handleStatusFilterClick}
						>
							<Label htmlFor="status-active" className="w-full">
								<RadioGroupItem value="active" id="status-active" />
								Active
							</Label>
							<Label htmlFor="status-inactive" className="w-full">
								<RadioGroupItem value="inactive" id="status-inactive" />
								Inactive
							</Label>
							<Label htmlFor="status-all" className="w-full">
								<RadioGroupItem value="all" id="status-all" />
								All
							</Label>
						</RadioGroup>
					</PopoverContent>
				</Popover>
			</div>
			<ScrollArea className="dark h-72 w-full rounded-md border bg-card text-card-foreground">
				<div className="p-4">
					<h4 className="mb-4 font-medium text-sm leading-none">Clients</h4>

					{filteredClients.map((client, index) => {
						const asanaProject = asanaProjectMap.get(client.asanaId);
						const asanaColor = getColorFromMap(asanaProject?.color ?? "");

						return (
							<Link href={`/clients/${client.hash}`} key={client.id}>
								<div key={client.hash} className="flex justify-between text-sm">
									<div className="flex items-center gap-2">
										{asanaColor && (
											<span
												className="h-3 w-3 rounded-full"
												style={{ backgroundColor: asanaColor }}
											/>
										)}
										<span>{client.fullName}</span>
									</div>
									<span
										className={cn(
											"text-muted-foreground",
											client.sortReason === "BabyNet above 2:6" &&
												"text-destructive",
										)}
									>
										<span className="font-bold text-muted-foreground">
											{client.interpreter ? "Interpreter " : ""}
										</span>
										{client.sortReason === "BabyNet above 2:6"
											? `BabyNet: ${formatClientAge(
													new Date(client.dob),
													"short",
												)}`
											: client.sortReason === "Added date"
												? `Added: ${client.addedDate?.toLocaleString("en-US", {
														year: "numeric",
														month: "short",
														day: "numeric",
													})}`
												: client.sortReason}
									</span>
								</div>
								{index !== filteredClients.length - 1 && (
									<Separator key="separator" className="my-2" />
								)}
							</Link>
						);
					})}
				</div>
			</ScrollArea>
		</div>
	);
}
