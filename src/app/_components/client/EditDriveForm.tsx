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
import type { Client } from "~/lib/types";
import { api } from "~/trpc/react";

const log = logger.child({ module: "EditDriveForm" });

export function EditDriveForm({
	client,
	editDriveDialog,
}: {
	client: Client;
	editDriveDialog: { open: boolean; setOpen: (open: boolean) => void };
}) {
	const utils = api.useUtils();

	const updateClient = api.clients.update.useMutation({
		onSuccess: () => {
			toast.success("Client drive record updated!");
			utils.clients.getOne.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to update client record", {
				description: error.message,
			});
			log.error(error, "Failed to update client");
		},
	});

	const addIdToFolder = api.google.addIdToFolder.useMutation({
		onSuccess: () => {
			toast.success("New folder renamed successfully (ID added).");
		},
		onError: (error) => {
			toast.error("Failed to rename new folder", {
				description: error.message,
			});
			log.error(error, "Failed to update new folder");
		},
	});

	const removeIdFromFolder = api.google.removeIdFromFolder.useMutation({
		onSuccess: () => {
			toast.success("Old folder renamed successfully (ID removed).");
		},
		onError: (error) => {
			toast.error("Failed to remove ID from old folder", {
				description: error.message,
			});
			log.error(error, "Failed to cleanup old folder");
		},
	});

	const formSchema = z.object({
		link: z.union([
			z
				.string()
				.refine(
					(link) => {
						const driveFolderRegex =
							/^https:\/\/drive\.google\.com\/(drive\/(u\/\d+\/)?folders\/|open\?id=)/i;
						return driveFolderRegex.test(link);
					},
					{
						message:
							"Link must be a valid Google Drive folder link, starting with https://drive.google.com/drive/folders/...",
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

	const defaultLink =
		client.driveId && client.driveId !== "N/A"
			? `https://drive.google.com/drive/folders/${client.driveId}`
			: "N/A";

	const form = useForm<driveIdValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			link: defaultLink,
		},
	});

	function onSubmit(values: driveIdValues) {
		const oldDriveId = client.driveId;
		let newDriveId = "N/A";

		if (values.link.toLowerCase() !== "n/a") {
			const url = new URL(values.link);
			const linkToProcess = url.search + url.pathname;
			const match = linkToProcess.match(
				/(?:\/folders\/|\?id=)([a-zA-Z0-9_-]+)/,
			);

			if (match?.[1]) {
				newDriveId = match[1];
			}
		}

		if (oldDriveId === newDriveId) {
			editDriveDialog.setOpen(false);
			return;
		}

		if (oldDriveId && oldDriveId !== "N/A") {
			removeIdFromFolder.mutate({
				folderId: oldDriveId,
			});
		}

		updateClient.mutate(
			{
				clientId: client.id,
				driveId: newDriveId,
			},
			{
				onSuccess: () => {
					if (newDriveId !== "N/A") {
						addIdToFolder.mutate({
							folderId: newDriveId,
							id: String(client.id),
						});
					}
					editDriveDialog.setOpen(false);
				},
			},
		);
	}

	return (
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
					<Button
						disabled={
							updateClient.isPending ||
							removeIdFromFolder.isPending ||
							addIdToFolder.isPending
						}
						type="submit"
					>
						{updateClient.isPending ? "Saving..." : "Save Changes"}
					</Button>
				</div>
			</form>
		</Form>
	);
}
