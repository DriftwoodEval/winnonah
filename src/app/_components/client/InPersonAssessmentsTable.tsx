"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@ui/alert-dialog";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { MoreHorizontal, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { formatShortDate } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";

type Assessment =
	RouterOutputs["questionnaires"]["getInPersonAssessments"][number];

function AssessmentActionsMenu({ assessment }: { assessment: Assessment }) {
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const utils = api.useUtils();

	const updateStatus =
		api.questionnaires.updateInPersonAssessmentStatus.useMutation({
			onSuccess: () =>
				utils.questionnaires.getInPersonAssessments.invalidate(
					assessment.clientId,
				),
			onError: () => toast.error("Failed to update status"),
		});

	const deleteAssessment =
		api.questionnaires.deleteInPersonAssessment.useMutation({
			onSuccess: () => {
				toast.success("Assessment removed");
				utils.questionnaires.getInPersonAssessments.invalidate(
					assessment.clientId,
				);
				setIsDeleteOpen(false);
			},
			onError: () => toast.error("Failed to remove assessment"),
		});

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button className="h-8 w-8 p-0" variant="ghost">
						<MoreHorizontal className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					{assessment.status !== "EXTERNAL" ? (
						<DropdownMenuItem
							disabled={updateStatus.isPending}
							onClick={() =>
								updateStatus.mutate({ id: assessment.id, status: "EXTERNAL" })
							}
						>
							Mark as External
						</DropdownMenuItem>
					) : (
						<DropdownMenuItem
							disabled={updateStatus.isPending}
							onClick={() =>
								updateStatus.mutate({ id: assessment.id, status: null })
							}
						>
							Clear Status
						</DropdownMenuItem>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className="text-destructive"
						onClick={() => setIsDeleteOpen(true)}
					>
						Remove
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog onOpenChange={setIsDeleteOpen} open={isDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove assessment?</AlertDialogTitle>
						<AlertDialogDescription>
							This will remove {assessment.assessmentType} from this client's
							in-person assessment list.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive"
							onClick={() => deleteAssessment.mutate({ id: assessment.id })}
						>
							Remove
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

function AddInPersonAssessmentButton({
	clientId,
	availableTypes,
}: {
	clientId: number;
	availableTypes: { id: number; name: string }[];
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [selected, setSelected] = useState<string>("");
	const utils = api.useUtils();

	const addAssessment = api.questionnaires.addInPersonAssessment.useMutation({
		onSuccess: () => {
			toast.success("Assessment added");
			utils.questionnaires.getInPersonAssessments.invalidate(clientId);
			setSelected("");
			setIsOpen(false);
		},
		onError: () => toast.error("Failed to add assessment"),
	});

	return (
		<Dialog onOpenChange={setIsOpen} open={isOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					<Plus className="mr-1 h-4 w-4" /> Add
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[360px]">
				<DialogHeader>
					<DialogTitle>Add In-Person Assessment</DialogTitle>
				</DialogHeader>
				<div className="space-y-4 pt-2">
					<Select onValueChange={setSelected} value={selected}>
						<SelectTrigger>
							<SelectValue placeholder="Select assessment..." />
						</SelectTrigger>
						<SelectContent>
							{availableTypes.map((t) => (
								<SelectItem key={t.id} value={t.name}>
									{t.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<div className="flex justify-end gap-2">
						<Button
							onClick={() => setIsOpen(false)}
							type="button"
							variant="ghost"
						>
							Cancel
						</Button>
						<Button
							disabled={!selected || addAssessment.isPending}
							onClick={() =>
								addAssessment.mutate({ clientId, assessmentType: selected })
							}
						>
							{addAssessment.isPending ? "Adding..." : "Add"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

interface InPersonAssessmentsTableProps {
	clientId: number | undefined;
	readOnly?: boolean;
}

export function InPersonAssessmentsTable({
	clientId,
	readOnly,
}: InPersonAssessmentsTableProps) {
	const can = useCheckPermission();
	const canManage = can("clients:questionnaires:in-person");

	const { data: assessments, isLoading } =
		api.questionnaires.getInPersonAssessments.useQuery(clientId ?? 0, {
			enabled: typeof clientId === "number" && clientId > 0,
		});

	const existingTypes = useMemo(
		() => new Set((assessments ?? []).map((a) => a.assessmentType)),
		[assessments],
	);

	const { data: allTypes } = api.questionnaires.getAllTypes.useQuery(
		undefined,
		{
			enabled: !readOnly && canManage,
		},
	);
	const availableToAdd = useMemo(
		() =>
			(allTypes ?? []).filter((t) => t.inPerson && !existingTypes.has(t.name)),
		[allTypes, existingTypes],
	);

	const showActions = !readOnly && canManage;

	if (
		!isLoading &&
		(!assessments || assessments.length === 0) &&
		!showActions
	) {
		return null;
	}

	return (
		<div className="w-full rounded-md border shadow">
			<div className="sticky top-0 z-10 flex items-center justify-between gap-2 p-4">
				<h4 className="font-bold leading-none">In-Person Assessments</h4>
				{showActions && clientId && availableToAdd.length > 0 && (
					<AddInPersonAssessmentButton
						availableTypes={availableToAdd}
						clientId={clientId}
					/>
				)}
			</div>
			{assessments && assessments.length > 0 && (
				<div className="px-4 pb-4">
					<Table className="text-xs">
						<TableHeader>
							<TableRow>
								{showActions && <TableHead className="w-10" />}
								<TableHead>Assessment</TableHead>
								<TableHead className="w-24">Status</TableHead>
								<TableHead className="hidden sm:table-cell">Source</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{assessments.map((assessment) => (
								<TableRow key={assessment.id}>
									{showActions && (
										<TableCell>
											<AssessmentActionsMenu assessment={assessment} />
										</TableCell>
									)}
									<TableCell className="font-medium">
										{assessment.assessmentType}
									</TableCell>
									<TableCell>
										{assessment.status === "EXTERNAL" ? (
											<Badge variant="outline">External</Badge>
										) : (
											<span className="text-muted-foreground text-xs">—</span>
										)}
									</TableCell>
									<TableCell className="hidden sm:table-cell">
										{assessment.appointmentId ? (
											<span className="text-muted-foreground text-xs">
												{assessment.appointmentStartTime
													? formatShortDate(
															assessment.appointmentStartTime,
															"—",
														)
													: "Imported"}
												{assessment.appointmentDaEval && (
													<Badge className="ml-1.5" variant="secondary">
														{assessment.appointmentDaEval}
													</Badge>
												)}
											</span>
										) : (
											<span className="text-muted-foreground text-xs">
												Manual
											</span>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
			{!isLoading && assessments?.length === 0 && showActions && (
				<p className="px-4 pb-4 text-muted-foreground text-sm">
					No in-person assessments added yet.
				</p>
			)}
		</div>
	);
}
