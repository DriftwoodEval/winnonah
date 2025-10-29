import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@ui/form";
import { Input } from "@ui/input";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";
import { logger } from "~/lib/logger";
import type { Client } from "~/server/lib/types";
import { api } from "~/trpc/react";
import {
	ResponsiveDialog,
	useResponsiveDialog,
} from "../shared/ResponsiveDialog";

const log = logger.child({ module: "AddDrive" });

export function AddDriveButton({ client }: { client: Client }) {
	const addDriveDialog = useResponsiveDialog();
	const addDriveTrigger = <Button size="sm">Add Drive</Button>;

	const utils = api.useUtils();
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

	const addIdToFolder = api.google.addIdToFolder.useMutation({
		onSuccess: () => {
			toast.success("Folder name updated successfully!");
		},
		onError: (error) => {
			toast.error("Failed to update folder", {
				description: error.message,
				duration: 10000,
			});
			log.error(error, "Failed to update folder");
		},
	});

	const formSchema = z.object({
		link: z.union([
			z
				.string()
				.refine(
					(link) => {
						const driveFolderRegex =
							/^https:\/\/drive\.google\.com\/drive\/(u\/\d+\/)?folders\//i;
						return driveFolderRegex.test(link);
					},
					{
						message:
							"Link must be a valid Google Drive folder link, starting with https://drive.google.com/drive/folders/ (or /drive/u/x/folders/ if you have multiple accounts).",
					},
				)
				.refine(
					(link) => {
						try {
							new URL(link);
							return true;
						} catch (_e) {
							return false;
						}
					},
					{
						message: "Invalid URL format.",
					},
				),
			z.string().refine((string) => string.toLowerCase() === "n/a"),
		]),
	});

	type driveIdValues = z.infer<typeof formSchema>;

	const form = useForm<driveIdValues>({
		resolver: zodResolver(formSchema),
	});

	function onSubmit(values: driveIdValues) {
		if (values.link.toLowerCase() === "n/a") {
			updateClient.mutate({
				clientId: client.id,
				driveId: "N/A",
			});
			addDriveDialog.closeDialog();
			return;
		}
		const match = values.link.match(/\/folders\/([^/]+)/);
		if (match && typeof match[1] === "string" && match[1]) {
			addIdToFolder.mutate({
				folderId: match[1],
				id: String(client.id),
			});
			updateClient.mutate({
				clientId: client.id,
				driveId: match[1],
			});
			addDriveDialog.closeDialog();
		}
	}

	return (
		<ResponsiveDialog
			description="Copy the full URL of a Google Drive folder and paste it here. The client's page will be linked to this folder. The folder's name will be edited to include the client's ID, if it doesn't already contain it."
			open={addDriveDialog.open}
			setOpen={addDriveDialog.setOpen}
			title="Add Drive"
			trigger={addDriveTrigger}
		>
			<Form {...form}>
				<form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
					<FormField
						control={form.control}
						name="link"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Link to Folder (or N/A)</FormLabel>
								<FormControl>
									<Input {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<div className="flex justify-end gap-2">
						<Button type="submit">Save</Button>
					</div>
				</form>
			</Form>
		</ResponsiveDialog>
	);
}
