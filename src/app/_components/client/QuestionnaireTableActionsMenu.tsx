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
import { Button } from "@ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { api, type RouterOutputs } from "~/trpc/react";
import {
	QuestionnaireTableForm,
	type QuestionnaireTableFormValues,
} from "./QuestionnaireTableForm";

type Questionnaire = NonNullable<
	RouterOutputs["questionnaires"]["getSentQuestionnaires"]
>[number];

interface QuestionnaireActionsMenuProps {
	questionnaire: Questionnaire;
}

export function QuestionnaireActionsMenu({
	questionnaire,
}: QuestionnaireActionsMenuProps) {
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const utils = api.useUtils();

	const { mutate: updateQuestionnaire, isPending: isUpdating } =
		api.questionnaires.updateQuestionnaire.useMutation({
			onSuccess: () => {
				utils.questionnaires.getSentQuestionnaires.invalidate(
					questionnaire.clientId,
				);
				setIsEditDialogOpen(false);
			},
			onError: (error) => console.error("Failed to update:", error),
		});

	const { mutate: deleteQuestionnaire, isPending: isDeleting } =
		api.questionnaires.deleteQuestionnaire.useMutation({
			onSuccess: () => {
				utils.questionnaires.getSentQuestionnaires.invalidate(
					questionnaire.clientId,
				);
				setIsDeleteDialogOpen(false);
			},
			onError: (error) => console.error("Failed to delete:", error),
		});

	const handleEditSubmit = (values: QuestionnaireTableFormValues) => {
		updateQuestionnaire({
			id: questionnaire.id,
			...values,
		});
	};

	const handleDeleteConfirm = () => {
		deleteQuestionnaire({ id: questionnaire.id });
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button className="h-8 w-8 p-0" variant="ghost">
						<span className="sr-only">Open menu</span>
						<MoreHorizontal className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
						Edit
					</DropdownMenuItem>
					<DropdownMenuItem
						className="text-destructive"
						onClick={() => setIsDeleteDialogOpen(true)}
					>
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Edit Dialog */}
			<Dialog onOpenChange={setIsEditDialogOpen} open={isEditDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit Questionnaire</DialogTitle>
					</DialogHeader>
					<QuestionnaireTableForm
						clientId={questionnaire.clientId}
						initialData={questionnaire}
						isLoading={isUpdating}
						onFinished={() => setIsEditDialogOpen(false)}
						onSubmit={handleEditSubmit}
					/>
				</DialogContent>
			</Dialog>

			{/* Delete Alert Dialog */}
			<AlertDialog
				onOpenChange={setIsDeleteDialogOpen}
				open={isDeleteDialogOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
						<AlertDialogDescription>
							This action cannot be undone. This will permanently delete the
							questionnaire record.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
							disabled={isDeleting}
							onClick={handleDeleteConfirm}
						>
							{isDeleting ? "Deleting..." : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
