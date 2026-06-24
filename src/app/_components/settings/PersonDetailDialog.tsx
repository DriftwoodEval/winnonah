"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@ui/form";
import { Input } from "@ui/input";
import { Separator } from "@ui/separator";
import { Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { logger } from "~/lib/logger";
import type { Evaluator, User } from "~/lib/models";
import { type PermissionsObject, permissionsSchema } from "~/lib/types";
import { api } from "~/trpc/react";
import { ResponsiveDialog } from "../shared/ResponsiveDialog";
import { EvaluatorForm } from "./EvaluatorForm";
import { PermissionsField } from "./PermissionsField";

const log = logger.child({ module: "PersonDetailDialog" });

export interface MergedPerson {
	email: string;
	name: string;
	user: User | null;
	evaluator: Evaluator | null;
}

const normalizePhone = (val: string): string => {
	if (!val || val.trim() === "") return "";
	const stripped = val.replace(/[\s\-().]/g, "");
	return stripped.startsWith("+") ? stripped : `+1${stripped}`;
};

export const formatPhoneAsYouType = (value: string): string => {
	let digits = value.replace(/\D/g, "");
	if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
	digits = digits.slice(0, 10);
	if (digits.length === 0) return "";
	if (digits.length <= 3) return `(${digits}`;
	if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
	return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const accountFormSchema = z.object({
	permissions: permissionsSchema,
	phoneNumber: z
		.string()
		.refine((val) => {
			if (!val) return true;
			const digits = val.replace(/\D/g, "");
			const stripped =
				digits.length === 11 && digits.startsWith("1")
					? digits.slice(1)
					: digits;
			return stripped.length === 10;
		}, "Must be a valid 10-digit phone number")
		.or(z.literal(""))
		.nullable()
		.optional(),
	maxClaimedReports: z.number().int().min(0).max(10).nullable().optional(),
});
type AccountFormValues = z.infer<typeof accountFormSchema>;

function AccountSection({
	user,
	canEdit,
	showHeading,
	onClose,
	linkedEvaluatorNpi,
}: {
	user: User;
	canEdit: boolean;
	showHeading: boolean;
	onClose: () => void;
	linkedEvaluatorNpi?: number;
}) {
	const { data: session } = useSession();
	const utils = api.useUtils();
	const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
	const [isArchiving, setIsArchiving] = useState(false);

	const hasBothRecords = linkedEvaluatorNpi !== undefined;

	const { mutateAsync: updateUser, isPending: isUpdating } =
		api.users.updateUser.useMutation({
			onError: (error) => {
				toast.error("Failed to update user", {
					description: String(error.message),
				});
				log.error(error, "Failed to update user");
			},
		});

	const { mutateAsync: setPhone } = api.users.setPhone.useMutation({
		onError: (error) => {
			toast.error("Failed to update phone", {
				description: String(error.message),
			});
		},
	});

	const { mutateAsync: setMaxClaimedReports } =
		api.users.setMaxClaimedReports.useMutation({
			onError: (error) => {
				toast.error("Failed to update report limit", {
					description: String(error.message),
				});
			},
		});

	const { mutateAsync: updateArchiveStatus } =
		api.users.updateUserArchiveStatus.useMutation({
			onError: (error) => {
				toast.error("Failed to update user status", {
					description: String(error.message),
				});
				log.error(error, "Failed to update user status");
			},
		});

	const { mutateAsync: archiveEvaluatorAsync } =
		api.evaluators.archive.useMutation({
			onError: (error) => {
				log.error(error, "Failed to archive evaluator");
				toast.error("Failed to archive evaluator profile", {
					description: error.message,
				});
			},
		});

	const { mutateAsync: unarchiveEvaluatorAsync } =
		api.evaluators.unarchive.useMutation({
			onError: (error) => {
				log.error(error, "Failed to unarchive evaluator");
				toast.error("Failed to unarchive evaluator profile", {
					description: error.message,
				});
			},
		});

	const handleArchiveConfirm = async () => {
		const newArchived = !user.archived;
		setIsArchiving(true);
		try {
			await updateArchiveStatus({ userId: user.id, archived: newArchived });
			if (linkedEvaluatorNpi !== undefined) {
				if (newArchived) {
					await archiveEvaluatorAsync({ npi: String(linkedEvaluatorNpi) });
				} else {
					await unarchiveEvaluatorAsync({ npi: String(linkedEvaluatorNpi) });
				}
			}
			utils.users.getAll.invalidate();
			utils.evaluators.getAll.invalidate();
			utils.evaluators.getArchived.invalidate();
			setIsArchiveDialogOpen(false);
			onClose();
			toast.success(
				newArchived
					? `${hasBothRecords ? "Person" : "User"} archived`
					: `${hasBothRecords ? "Person" : "User"} unarchived`,
			);
		} catch {
			// individual mutation onError handlers show toasts
		} finally {
			setIsArchiving(false);
		}
	};

	const form = useForm<AccountFormValues>({
		resolver: zodResolver(accountFormSchema),
		defaultValues: {
			permissions: (user.permissions as PermissionsObject) ?? {},
			phoneNumber: user.phoneNumber
				? formatPhoneAsYouType(user.phoneNumber)
				: "",
			maxClaimedReports: user.maxClaimedReports ?? null,
		},
	});

	const permissions = form.watch("permissions");

	const isPermissionDisabled = (permissionId: string) =>
		session?.user?.id === user.id && permissionId === "settings:users:edit";

	const onSubmit = async (values: AccountFormValues) => {
		const normalized = values.phoneNumber
			? normalizePhone(values.phoneNumber)
			: "";
		const phoneValue = normalized === "" ? null : normalized;
		await Promise.all([
			updateUser({ userId: user.id, permissions: values.permissions }),
			setPhone({ userId: user.id, phoneNumber: phoneValue }),
			setMaxClaimedReports({
				userId: user.id,
				maxClaimedReports: values.maxClaimedReports ?? null,
			}),
		]);
		utils.users.getAll.invalidate();
		toast.success("Account updated");
	};

	return (
		<div className="space-y-4">
			{showHeading && <h4 className="font-semibold text-base">Account</h4>}
			<Form {...form}>
				<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
					<PermissionsField
						disabled={!canEdit}
						isPermissionDisabled={isPermissionDisabled}
						onChange={(p) =>
							form.setValue("permissions", p, {
								shouldDirty: true,
								shouldValidate: true,
							})
						}
						value={permissions ?? {}}
					/>

					<div className="space-y-4 border-t pt-4">
						<FormField
							control={form.control}
							name="phoneNumber"
							render={({ field }) => (
								<FormItem className="max-w-xs">
									<FormLabel>Phone Number</FormLabel>
									<FormControl>
										<Input
											disabled={!canEdit}
											placeholder="(212) 555-1234"
											{...field}
											onBlur={field.onBlur}
											onChange={(e) =>
												field.onChange(formatPhoneAsYouType(e.target.value))
											}
											value={field.value ?? ""}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="maxClaimedReports"
							render={({ field }) => (
								<FormItem className="max-w-xs">
									<FormLabel>Max Claimed Reports</FormLabel>
									<FormControl>
										<Input
											disabled={!canEdit}
											max={10}
											min={0}
											placeholder="Default"
											type="number"
											{...field}
											onChange={(e) => {
												const val = e.target.value;
												field.onChange(
													val === "" ? null : Number.parseInt(val, 10),
												);
											}}
											value={field.value ?? ""}
										/>
									</FormControl>
									<FormDescription>
										Leave blank to use the default. Overrides how many reports
										this user can have claimed at once.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>

					<div className="flex items-center justify-between">
						<Button
							disabled={!canEdit}
							onClick={() => setIsArchiveDialogOpen(true)}
							size="sm"
							type="button"
							variant={user.archived ? "outline" : "destructive"}
						>
							{user.archived
								? hasBothRecords
									? "Unarchive Person"
									: "Unarchive Account"
								: hasBothRecords
									? "Archive Person"
									: "Archive Account"}
						</Button>
						<Button disabled={isUpdating || !canEdit} type="submit">
							{isUpdating ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Saving...
								</>
							) : (
								"Save Account"
							)}
						</Button>
					</div>
				</form>
			</Form>

			<AlertDialog
				onOpenChange={setIsArchiveDialogOpen}
				open={isArchiveDialogOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{user.archived
								? hasBothRecords
									? "Unarchive this person?"
									: "Unarchive account?"
								: hasBothRecords
									? "Archive this person?"
									: "Archive account?"}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{user.archived
								? hasBothRecords
									? "This will re-enable their login and make their evaluator profile active again."
									: "Unarchiving will allow this user to log in again."
								: hasBothRecords
									? "This will prevent them from logging in and hide their evaluator profile from matching. Can be reversed."
									: "Archiving will prevent this user from logging in. This can be reversed."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className={
								!user.archived ? "bg-destructive hover:bg-destructive/90" : ""
							}
							disabled={isArchiving}
							onClick={handleArchiveConfirm}
						>
							{isArchiving
								? user.archived
									? "Unarchiving..."
									: "Archiving..."
								: user.archived
									? "Unarchive"
									: "Archive"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function EvaluatorSection({
	evaluator,
	canEdit,
	showHeading,
	showArchiveButton,
	onClose,
}: {
	evaluator: Evaluator;
	canEdit: boolean;
	showHeading: boolean;
	showArchiveButton: boolean;
	onClose: () => void;
}) {
	const utils = api.useUtils();
	const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);

	const updateEvaluator = api.evaluators.update.useMutation({
		onSuccess: () => {
			toast.success("Evaluator profile updated");
			utils.evaluators.getAll.invalidate();
		},
		onError: (error) => {
			log.error(error, "Failed to update evaluator");
			toast.error("Failed to update evaluator profile", {
				description: error.message,
			});
		},
	});

	const archiveEvaluator = api.evaluators.archive.useMutation({
		onSuccess: () => {
			toast.success("Evaluator profile archived");
			utils.evaluators.getAll.invalidate();
			utils.evaluators.getArchived.invalidate();
			setIsArchiveDialogOpen(false);
			onClose();
		},
		onError: (error) => {
			log.error(error, "Failed to archive evaluator");
			toast.error("Failed to archive evaluator profile", {
				description: error.message,
			});
		},
	});

	const unarchiveEvaluator = api.evaluators.unarchive.useMutation({
		onSuccess: () => {
			toast.success("Evaluator profile unarchived");
			utils.evaluators.getAll.invalidate();
			utils.evaluators.getArchived.invalidate();
			setIsArchiveDialogOpen(false);
			onClose();
		},
		onError: (error) => {
			log.error(error, "Failed to unarchive evaluator");
			toast.error("Failed to unarchive evaluator profile", {
				description: error.message,
			});
		},
	});

	const archiveButton = showArchiveButton ? (
		<Button
			disabled={!canEdit}
			onClick={() => setIsArchiveDialogOpen(true)}
			size="sm"
			type="button"
			variant={evaluator.archived ? "outline" : "destructive"}
		>
			{evaluator.archived ? "Unarchive Profile" : "Archive Profile"}
		</Button>
	) : undefined;

	return (
		<div className="space-y-4">
			{showHeading && (
				<h4 className="font-semibold text-base">Evaluator Profile</h4>
			)}
			<EvaluatorForm
				archiveButton={archiveButton}
				disabled={!canEdit}
				initialData={evaluator}
				isLoading={updateEvaluator.isPending}
				onSubmit={(values) =>
					updateEvaluator.mutate({ ...values, npi: String(evaluator.npi) })
				}
			/>

			{showArchiveButton && (
				<AlertDialog
					onOpenChange={setIsArchiveDialogOpen}
					open={isArchiveDialogOpen}
				>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								{evaluator.archived
									? "Unarchive evaluator profile?"
									: "Archive evaluator profile?"}
							</AlertDialogTitle>
							<AlertDialogDescription>
								{evaluator.archived
									? "This will make the evaluator available again for matching."
									: `${evaluator.providerName} will be hidden from all lists and won't be matched to new clients. Can be reversed.`}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								className={
									!evaluator.archived
										? "bg-destructive text-destructive-foreground hover:bg-destructive/80"
										: ""
								}
								onClick={() => {
									if (evaluator.archived) {
										unarchiveEvaluator.mutate({ npi: String(evaluator.npi) });
									} else {
										archiveEvaluator.mutate({ npi: String(evaluator.npi) });
									}
								}}
							>
								{evaluator.archived ? "Unarchive" : "Archive"}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			)}
		</div>
	);
}

function AddEvaluatorSection({
	email,
	canEdit,
	onSuccess,
}: {
	email: string;
	canEdit: boolean;
	onSuccess: () => void;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();

	const createEvaluator = api.evaluators.create.useMutation({
		onSuccess: () => {
			toast.success("Evaluator profile created");
			utils.evaluators.getAll.invalidate();
			utils.users.getAll.invalidate();
			onSuccess();
		},
		onError: (error) => {
			log.error(error, "Failed to create evaluator profile");
			toast.error("Failed to create evaluator profile", {
				description: error.message,
				duration: 10000,
			});
		},
	});

	return (
		<div className="space-y-4">
			<Separator />
			<div className="flex items-center justify-between">
				<h4 className="font-semibold text-base">Evaluator Profile</h4>
				{canEdit && !isOpen && (
					<Button
						onClick={() => setIsOpen(true)}
						size="sm"
						type="button"
						variant="outline"
					>
						Add Profile
					</Button>
				)}
			</div>
			{isOpen ? (
				<EvaluatorForm
					initialEmail={email}
					isLoading={createEvaluator.isPending}
					onClose={() => setIsOpen(false)}
					onSubmit={(values) => createEvaluator.mutate(values)}
				/>
			) : (
				<p className="text-muted-foreground text-sm">
					No evaluator profile linked to this account.
				</p>
			)}
		</div>
	);
}

function InviteSection({ email }: { email: string }) {
	const can = useCheckPermission();
	const canInvite = can("settings:users:invite");
	const utils = api.useUtils();

	const sendInvite = api.users.createInvitation.useMutation({
		onSuccess: () => {
			toast.success(`Invite sent to ${email}`);
			utils.users.getPendingInvitations.invalidate();
		},
		onError: (error) => {
			log.error(error, "Failed to send invite");
			toast.error("Failed to send invite", { description: error.message });
		},
	});

	if (!canInvite) return null;

	return (
		<div className="space-y-4">
			<Separator />
			<div className="flex items-center justify-between">
				<div>
					<h4 className="font-semibold text-base">User Account</h4>
					<p className="mt-1 text-muted-foreground text-sm">
						No user account for this evaluator.
					</p>
				</div>
				<Button
					disabled={sendInvite.isPending}
					onClick={() => sendInvite.mutate({ email, permissions: {} })}
					size="sm"
					type="button"
					variant="outline"
				>
					{sendInvite.isPending ? "Sending..." : "Send Invite"}
				</Button>
			</div>
		</div>
	);
}

export function PersonDetailDialog({
	person,
	open,
	setOpen,
	canEditUsers,
	canEditEvaluators,
}: {
	person: MergedPerson;
	open: boolean;
	setOpen: (open: boolean) => void;
	canEditUsers: boolean;
	canEditEvaluators: boolean;
}) {
	const hasBoth = person.user !== null && person.evaluator !== null;

	return (
		<ResponsiveDialog
			className="sm:max-w-3xl"
			description={person.email}
			open={open}
			setOpen={setOpen}
			title={person.name}
		>
			<div className="space-y-8 pb-4">
				{person.user && (
					<AccountSection
						canEdit={canEditUsers}
						linkedEvaluatorNpi={
							hasBoth ? (person.evaluator?.npi ?? undefined) : undefined
						}
						onClose={() => setOpen(false)}
						showHeading={hasBoth}
						user={person.user}
					/>
				)}
				{hasBoth && <Separator />}
				{person.evaluator && (
					<EvaluatorSection
						canEdit={canEditEvaluators}
						evaluator={person.evaluator}
						onClose={() => setOpen(false)}
						showArchiveButton={!hasBoth}
						showHeading={hasBoth}
					/>
				)}
				{person.user && !person.evaluator && (
					<AddEvaluatorSection
						canEdit={canEditEvaluators}
						email={person.email}
						onSuccess={() => setOpen(false)}
					/>
				)}
				{person.evaluator && !person.user && (
					<InviteSection email={person.email} />
				)}
			</div>
		</ResponsiveDialog>
	);
}
