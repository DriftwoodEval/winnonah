"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@ui/avatar";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@ui/dialog";
import { Skeleton } from "@ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { logger } from "~/lib/logger";
import type { Evaluator, Role, User } from "~/lib/models";
import { api } from "~/trpc/react";
import { EvaluatorForm } from "./EvaluatorForm";
import {
	formatPhoneAsYouType,
	type MergedPerson,
	PersonDetailDialog,
} from "./PersonDetailDialog";

const log = logger.child({ module: "PeopleTable" });

const getInitials = (name: string | null | undefined) => {
	if (!name) return "";
	return name
		.split(" ")
		.map((n) => (n ?? "")[0]?.toUpperCase())
		.join("");
};

function mergePeople(
	users: User[] | undefined,
	evaluators: Evaluator[] | undefined,
): MergedPerson[] {
	const map = new Map<string, MergedPerson>();

	for (const user of users ?? []) {
		map.set(user.email, {
			email: user.email,
			name: user.name ?? user.email,
			user,
			evaluator: null,
		});
	}

	for (const evaluator of evaluators ?? []) {
		const existing = map.get(evaluator.email);
		if (existing) {
			existing.evaluator = evaluator;
		} else {
			map.set(evaluator.email, {
				email: evaluator.email,
				name: evaluator.providerName,
				user: null,
				evaluator,
			});
		}
	}

	return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function AddEvaluatorButton() {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();

	const createEvaluator = api.evaluators.create.useMutation({
		onSuccess: () => {
			toast.success("Evaluator created successfully");
			utils.evaluators.getAll.invalidate();
			utils.users.getPendingInvitations.invalidate();
			setIsOpen(false);
		},
		onError: (error) => {
			log.error(error, "Failed to create evaluator");
			toast.error("Failed to create evaluator", {
				description: error.message,
				duration: 10000,
			});
		},
	});

	return (
		<Dialog onOpenChange={setIsOpen} open={isOpen}>
			<DialogTrigger asChild>
				<Button size="sm">
					<span className="hidden sm:block">Add Evaluator</span>
					<span className="sm:hidden">Add</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Add New Evaluator</DialogTitle>
				</DialogHeader>
				<EvaluatorForm
					isLoading={createEvaluator.isPending}
					onClose={() => setIsOpen(false)}
					onSubmit={(values) => createEvaluator.mutate(values)}
				/>
			</DialogContent>
		</Dialog>
	);
}

interface PeopleListProps {
	people: MergedPerson[];
	roles: Role[] | undefined;
	isLoading: boolean;
	canEditUsers: boolean;
	canEditEvaluators: boolean;
	canManageDashboard: boolean;
	emptyMessage: string;
}

function PeopleList({
	people,
	roles,
	isLoading,
	canEditUsers,
	canEditEvaluators,
	canManageDashboard,
	emptyMessage,
}: PeopleListProps) {
	const getRoleName = (roleId: number | null | undefined) =>
		roleId ? roles?.find((r) => r.id === roleId)?.name : undefined;

	const [selectedPerson, setSelectedPerson] = useState<MergedPerson | null>(
		null,
	);

	return (
		<>
			<div className="hidden sm:block">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-[20px]" />
							<TableHead>Name</TableHead>
							<TableHead>Email</TableHead>
							<TableHead>Phone</TableHead>
							<TableHead>Insurances</TableHead>
							<TableHead>Offices</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading ? (
							Array.from({ length: 3 }).map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
								<TableRow key={i}>
									<TableCell>
										<Skeleton className="h-8 w-8 rounded-full" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-32" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-48" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-28" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-24" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-20" />
									</TableCell>
								</TableRow>
							))
						) : people.length > 0 ? (
							people.map((person) => (
								<TableRow
									className="cursor-pointer"
									key={person.email}
									onClick={() => setSelectedPerson(person)}
								>
									<TableCell>
										<Avatar>
											<AvatarImage src={person.user?.image ?? ""} />
											<AvatarFallback>
												{getInitials(person.name)}
											</AvatarFallback>
										</Avatar>
									</TableCell>
									<TableCell className="font-medium">
										<div className="flex flex-col gap-1">
											{person.name}
											<div className="flex flex-wrap gap-1">
												{person.user && (
													<Badge className="w-fit text-xs" variant="outline">
														User
													</Badge>
												)}
												{person.evaluator && (
													<Badge className="w-fit text-xs" variant="outline">
														Evaluator
													</Badge>
												)}
												{getRoleName(person.user?.roleId) && (
													<Badge className="w-fit text-xs" variant="secondary">
														{getRoleName(person.user?.roleId)}
													</Badge>
												)}
											</div>
										</div>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{person.email}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{person.user?.phoneNumber
											? formatPhoneAsYouType(person.user.phoneNumber)
											: "—"}
									</TableCell>
									<TableCell>
										{person.evaluator?.insurances?.length ? (
											<div className="flex flex-wrap gap-1">
												{person.evaluator.insurances.map((ins) => (
													<Badge key={ins.id} variant="secondary">
														{ins.shortName}
													</Badge>
												))}
											</div>
										) : (
											<span className="text-muted-foreground">—</span>
										)}
									</TableCell>
									<TableCell>
										{person.evaluator?.offices?.length ? (
											<div className="flex flex-wrap gap-1">
												{person.evaluator.offices.map((office) => (
													<Badge key={office.key} variant="secondary">
														{office.prettyName}
													</Badge>
												))}
											</div>
										) : (
											<span className="text-muted-foreground">—</span>
										)}
									</TableCell>
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell className="py-12 text-center" colSpan={6}>
									<p className="text-muted-foreground text-sm">
										{emptyMessage}
									</p>
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			<div className="grid grid-cols-1 gap-4 sm:hidden">
				{isLoading ? (
					Array.from({ length: 3 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
						<div className="rounded-md border bg-card p-4" key={i}>
							<div className="flex items-center gap-4">
								<Skeleton className="h-10 w-10 rounded-full" />
								<div className="space-y-2">
									<Skeleton className="h-4 w-32" />
									<Skeleton className="h-3 w-48" />
								</div>
							</div>
						</div>
					))
				) : people.length > 0 ? (
					people.map((person) => (
						<button
							className="w-full rounded-md border bg-card p-4 text-left text-card-foreground"
							key={person.email}
							onClick={() => setSelectedPerson(person)}
							type="button"
						>
							<div className="flex items-center gap-4">
								<Avatar>
									<AvatarImage src={person.user?.image ?? ""} />
									<AvatarFallback>{getInitials(person.name)}</AvatarFallback>
								</Avatar>
								<div className="min-w-0 space-y-1">
									<div className="flex flex-wrap items-center gap-1">
										<p className="font-medium">{person.name}</p>
										{person.user && (
											<Badge className="text-xs" variant="outline">
												User
											</Badge>
										)}
										{person.evaluator && (
											<Badge className="text-xs" variant="outline">
												Evaluator
											</Badge>
										)}
										{getRoleName(person.user?.roleId) && (
											<Badge className="text-xs" variant="secondary">
												{getRoleName(person.user?.roleId)}
											</Badge>
										)}
									</div>
									<p className="truncate text-muted-foreground text-sm">
										{person.email}
									</p>
									{person.user?.phoneNumber && (
										<p className="text-muted-foreground text-sm">
											{formatPhoneAsYouType(person.user.phoneNumber)}
										</p>
									)}
									{person.evaluator?.insurances?.length ? (
										<div className="flex flex-wrap gap-1 pt-1">
											{person.evaluator.insurances.map((ins) => (
												<Badge key={ins.id} variant="secondary">
													{ins.shortName}
												</Badge>
											))}
										</div>
									) : null}
								</div>
							</div>
						</button>
					))
				) : (
					<p className="py-10 text-center text-muted-foreground text-sm">
						{emptyMessage}
					</p>
				)}
			</div>

			{selectedPerson && (
				<PersonDetailDialog
					canEditEvaluators={canEditEvaluators}
					canEditUsers={canEditUsers}
					canManageDashboard={canManageDashboard}
					open={selectedPerson !== null}
					person={selectedPerson}
					setOpen={(open) => {
						if (!open) setSelectedPerson(null);
					}}
				/>
			)}
		</>
	);
}

export default function PeopleTable() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const activeTab = searchParams.get("peopleTab") ?? "active";

	const handleTabChange = (value: string) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set("peopleTab", value);
		router.push(`${pathname}?${params.toString()}`);
	};

	const can = useCheckPermission();
	const canEditUsers = can("settings:users:edit");
	const canEditEvaluators = can("settings:evaluators");
	const canManageDashboard = can("evaluator-dashboard:admin");

	const { data: activeUsers, isLoading: isLoadingActiveUsers } =
		api.users.getAll.useQuery({ archived: false });
	const { data: archivedUsers, isLoading: isLoadingArchivedUsers } =
		api.users.getAll.useQuery({ archived: true });
	const { data: activeEvaluators, isLoading: isLoadingActiveEvaluators } =
		api.evaluators.getAll.useQuery();
	const { data: archivedEvaluators, isLoading: isLoadingArchivedEvaluators } =
		api.evaluators.getArchived.useQuery();
	const { data: roles } = api.roles.getAll.useQuery();

	const activePeople = useMemo(
		() => mergePeople(activeUsers, activeEvaluators),
		[activeUsers, activeEvaluators],
	);

	const archivedPeople = useMemo(
		() => mergePeople(archivedUsers, archivedEvaluators),
		[archivedUsers, archivedEvaluators],
	);

	const isLoadingActive = isLoadingActiveUsers || isLoadingActiveEvaluators;
	const isLoadingArchived =
		isLoadingArchivedUsers || isLoadingArchivedEvaluators;

	return (
		<div className="px-4">
			<div className="flex items-center justify-between pb-4">
				<h3 className="font-bold text-lg">People</h3>
				{canEditEvaluators && activeTab === "active" && <AddEvaluatorButton />}
			</div>
			<Tabs onValueChange={handleTabChange} value={activeTab}>
				<TabsList>
					<TabsTrigger value="active">
						Active
						{activePeople.length > 0 && (
							<span className="text-muted-foreground">
								({activePeople.length})
							</span>
						)}
					</TabsTrigger>
					<TabsTrigger value="archived">
						Archived
						{archivedPeople.length > 0 && (
							<span className="text-muted-foreground">
								({archivedPeople.length})
							</span>
						)}
					</TabsTrigger>
				</TabsList>
				<TabsContent value="active">
					<PeopleList
						canEditEvaluators={canEditEvaluators}
						canEditUsers={canEditUsers}
						canManageDashboard={canManageDashboard}
						emptyMessage="No active people found."
						isLoading={isLoadingActive}
						people={activePeople}
						roles={roles}
					/>
				</TabsContent>
				<TabsContent value="archived">
					<PeopleList
						canEditEvaluators={canEditEvaluators}
						canEditUsers={canEditUsers}
						canManageDashboard={canManageDashboard}
						emptyMessage="No archived people found."
						isLoading={isLoadingArchived}
						people={archivedPeople}
						roles={roles}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}
