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
import { Checkbox } from "@ui/checkbox";
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
import MultipleSelector from "@ui/multiple-selector";
import { Separator } from "@ui/separator";
import { Switch } from "@ui/switch";
import { Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { logger } from "~/lib/logger";
import type { Evaluator, User } from "~/lib/models";
import { type PermissionsObject, permissionsSchema } from "~/lib/types";
import { api } from "~/trpc/react";
import { ResponsiveDialog } from "../shared/ResponsiveDialog";
import {
	EvaluatorForm,
	type EvaluatorFormValues,
	evaluatorFormSchema,
} from "./EvaluatorForm";
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
	maxClaimedReports: z.number().int().min(1).max(10).nullable().optional(),
});
type AccountFormValues = z.infer<typeof accountFormSchema>;

const DIAG_COLS = [
	{ key: "ASD" },
	{ key: "ADHD" },
	{ key: "ASD+ADHD" },
	{ key: "ASD+LD" },
	{ key: "ADHD+LD" },
	{ key: "LD" },
] as const;

const AGE_VARIANTS = [
	{ suffix: "", label: "" },
	{ suffix: "/young", label: " (≤6)" },
	{ suffix: "/older", label: " (7+)" },
] as const;

const APPT_TYPES = ["DA", "EVAL", "DAEVAL"] as const;

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
											min={1}
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

	const { data: allOffices, isLoading: isLoadingOffices } =
		api.offices.getAll.useQuery();
	const { data: allZipCodes, isLoading: isLoadingZipCodes } =
		api.evaluators.getAllZipCodes.useQuery();
	const { data: allSchoolDistricts, isLoading: isLoadingSchoolDistricts } =
		api.evaluators.getAllSchoolDistricts.useQuery();
	const { data: allInsurances, isLoading: isLoadingInsurances } =
		api.insurances.getAll.useQuery();

	const zipCodeOptions = useMemo(() => {
		if (!allZipCodes) return [];
		return allZipCodes.map((zip) => ({ label: zip.zip, value: zip.zip }));
	}, [allZipCodes]);

	const districtOptions = useMemo(() => {
		return (
			allSchoolDistricts?.map((district) => ({
				value: district.id.toString(),
				label: district.shortName || district.fullName,
			})) ?? []
		);
	}, [allSchoolDistricts]);

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

	const form = useForm<EvaluatorFormValues>({
		resolver: zodResolver(evaluatorFormSchema),
		defaultValues: {
			npi: evaluator.npi.toString(),
			providerName: evaluator.providerName,
			email: evaluator.email,
			outOfOfficePriority: evaluator.outOfOfficePriority,
			insurances: evaluator.insurances.map((i) => i.id),
			offices: evaluator.offices.map((o) => o.key),
			blockedDistricts: evaluator.blockedDistricts?.map((d) => d.id) ?? [],
			blockedZips: evaluator.blockedZips?.map((z) => z.zip) ?? [],
			appointmentDurations:
				(evaluator.appointmentDurations as Record<string, number>) ?? {},
			allowedAppointmentTypes: (evaluator.allowedAppointmentTypes ?? [
				"DA",
				"EVAL",
				"DAEVAL",
			]) as ("DA" | "EVAL" | "DAEVAL")[],
		},
	});

	const durations = form.watch("appointmentDurations") ?? {};
	const allowedTypes = form.watch("allowedAppointmentTypes") ?? [
		"DA",
		"EVAL",
		"DAEVAL",
	];

	const getDuration = (key: string) => {
		const val = durations[key];
		return val !== undefined ? String(val / 60) : "";
	};

	const setDuration = (key: string, raw: string) => {
		const current = { ...(form.getValues("appointmentDurations") ?? {}) };
		const hrs = parseFloat(raw);
		if (!raw || Number.isNaN(hrs) || hrs < 0) {
			delete current[key];
		} else {
			current[key] = Math.round(hrs * 60);
		}
		form.setValue("appointmentDurations", current, { shouldDirty: true });
	};

	const dInput = (key: string) => {
		const baseType = key.split("/")[0] ?? key;
		const isTypeDisabled =
			baseType !== "default" &&
			!allowedTypes.includes(baseType as "DA" | "EVAL" | "DAEVAL");
		return (
			<Input
				className="h-8 text-center text-sm"
				disabled={!canEdit || isTypeDisabled}
				min="0"
				onChange={(e) => setDuration(key, e.target.value)}
				placeholder="—"
				step="0.5"
				type="number"
				value={getDuration(key)}
			/>
		);
	};

	const onSubmit = (values: EvaluatorFormValues) => {
		updateEvaluator.mutate({ ...values, npi: String(evaluator.npi) });
	};

	return (
		<div className="space-y-4">
			{showHeading && (
				<h4 className="font-semibold text-base">Evaluator Profile</h4>
			)}
			<Form {...form}>
				<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<FormField
							control={form.control}
							name="npi"
							render={({ field }) => (
								<FormItem>
									<FormLabel>NPI</FormLabel>
									<FormControl>
										<Input disabled placeholder="1234567890" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="providerName"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Provider Name</FormLabel>
									<FormControl>
										<Input
											disabled={!canEdit}
											placeholder="Jane Doe"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>

					<div className="flex items-center gap-4">
						<FormField
							control={form.control}
							name="email"
							render={({ field }) => (
								<FormItem className="w-full">
									<FormLabel>Email</FormLabel>
									<FormControl>
										<Input
											disabled
											placeholder="evaluator@domain.com"
											type="email"
											{...field}
										/>
									</FormControl>
									<FormDescription>
										Email is set at creation and cannot be changed.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="outOfOfficePriority"
							render={({ field }) => (
								<FormItem className="flex flex-col gap-2">
									<FormLabel>Out of Office Priority</FormLabel>
									<FormDescription>
										This evaluator tells us their out of office times, not their
										in office times.
									</FormDescription>
									<FormControl>
										<Switch
											checked={field.value}
											disabled={!canEdit}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>

					<div className="space-y-2">
						<FormLabel>Insurance</FormLabel>
						<div className="grid grid-cols-2 gap-4 rounded-md border p-4 sm:grid-cols-3">
							{isLoadingInsurances ? (
								<p>Loading insurances...</p>
							) : (
								allInsurances?.map((insurance) => (
									<FormField
										control={form.control}
										key={insurance.id}
										name="insurances"
										render={({ field }) => (
											<FormItem className="flex items-center space-x-2 space-y-0">
												<FormControl>
													<Checkbox
														checked={field.value?.includes(insurance.id)}
														disabled={!canEdit}
														onCheckedChange={(checked) => {
															return checked
																? field.onChange([...field.value, insurance.id])
																: field.onChange(
																		field.value?.filter(
																			(v: number) => v !== insurance.id,
																		),
																	);
														}}
													/>
												</FormControl>
												<FormLabel className="font-normal">
													{insurance.shortName}
												</FormLabel>
											</FormItem>
										)}
									/>
								))
							)}
						</div>
					</div>

					<FormField
						control={form.control}
						name="offices"
						render={({ field: _ }) => (
							<FormItem>
								<FormLabel>Offices</FormLabel>
								<div className="flex justify-between gap-4 rounded-md border p-4 sm:justify-center">
									{isLoadingOffices ? (
										<p>Loading offices...</p>
									) : (
										allOffices?.map((office) => (
											<FormField
												control={form.control}
												key={office.key}
												name="offices"
												render={({ field }) => (
													<FormItem
														className="flex items-center"
														key={office.key}
													>
														<FormControl>
															<Checkbox
																checked={field.value?.includes(office.key)}
																disabled={!canEdit}
																onCheckedChange={(checked) => {
																	return checked
																		? field.onChange([
																				...field.value,
																				office.key,
																			])
																		: field.onChange(
																				field.value?.filter(
																					(v) => v !== office.key,
																				),
																			);
																}}
															/>
														</FormControl>
														<FormLabel className="hidden font-normal sm:block">
															{office.prettyName}
														</FormLabel>
														<FormLabel className="font-normal sm:hidden">
															{office.key}
														</FormLabel>
													</FormItem>
												)}
											/>
										))
									)}
								</div>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="blockedDistricts"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Blocked School Districts</FormLabel>
								<FormControl>
									<MultipleSelector
										badgeClassName="bg-secondary text-secondary-foreground"
										disabled={!canEdit}
										emptyIndicator={
											<p className="text-center text-muted-foreground text-sm">
												No districts found.
											</p>
										}
										loadingIndicator={
											isLoadingSchoolDistricts ? (
												<p className="text-center text-muted-foreground text-sm">
													Loading districts...
												</p>
											) : undefined
										}
										onChange={(options) =>
											field.onChange(options.map((opt) => Number(opt.value)))
										}
										options={districtOptions}
										placeholder="Select districts..."
										value={districtOptions.filter((opt) =>
											field.value.includes(Number(opt.value)),
										)}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="blockedZips"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Blocked Zip Codes</FormLabel>
								<FormControl>
									{/* BUG: This doesn't take keyboard tab focus properly */}
									<MultipleSelector
										badgeClassName="bg-secondary text-secondary-foreground"
										creatable={true}
										defaultOptions={zipCodeOptions}
										disabled={!canEdit}
										emptyIndicator={
											<p className="text-center text-muted-foreground text-sm">
												No zip codes found. Type to create a new one.
											</p>
										}
										loadingIndicator={
											isLoadingZipCodes ? (
												<p className="text-center text-muted-foreground text-sm">
													Loading zips...
												</p>
											) : undefined
										}
										onChange={(options) =>
											field.onChange(options.map((opt) => opt.value))
										}
										placeholder="Select zip codes..."
										value={field.value.map((zip) => ({
											label: zip,
											value: zip,
										}))}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="allowedAppointmentTypes"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Allowed Appointment Types</FormLabel>
								<div className="flex gap-4">
									{(["DA", "EVAL", "DAEVAL"] as const).map((type) => (
										<FormItem
											className="flex items-center gap-2 space-y-0"
											key={type}
										>
											<FormControl>
												<Checkbox
													checked={field.value.includes(type)}
													disabled={!canEdit}
													onCheckedChange={(checked) => {
														if (checked) {
															field.onChange([...field.value, type]);
														} else {
															field.onChange(
																field.value.filter((t) => t !== type),
															);
														}
													}}
												/>
											</FormControl>
											<FormLabel className="font-normal">{type}</FormLabel>
										</FormItem>
									))}
								</div>
							</FormItem>
						)}
					/>

					<div className="space-y-2">
						<FormLabel>Appointment Durations (hours)</FormLabel>
						<div className="overflow-x-auto rounded-md border p-3">
							<div className="grid min-w-[600px] grid-cols-8 items-center gap-x-2 gap-y-2 text-sm">
								<div />
								<div className="text-center font-medium text-muted-foreground text-xs">
									(any)
								</div>
								{DIAG_COLS.map((d) => (
									<div
										className="text-center font-medium text-muted-foreground text-xs"
										key={d.key}
									>
										{d.key}
									</div>
								))}

								{AGE_VARIANTS.map(({ suffix, label }) => (
									<>
										<div className="font-medium" key={`default-label${suffix}`}>
											Default{label}
										</div>
										{dInput(`default${suffix}`)}
										{DIAG_COLS.map((d) => (
											<div key={`default${suffix}-${d.key}`} />
										))}
									</>
								))}

								{APPT_TYPES.map((type) =>
									AGE_VARIANTS.map(({ suffix, label }) => (
										<>
											<div
												className="font-medium"
												key={`${type}-label${suffix}`}
											>
												{type}
												{label}
											</div>
											{dInput(`${type}${suffix}`)}
											{DIAG_COLS.map((d) => (
												<span key={`${type}/${d.key}${suffix}`}>
													{dInput(`${type}/${d.key}${suffix}`)}
												</span>
											))}
										</>
									)),
								)}
							</div>
						</div>
						<p className="text-muted-foreground text-xs">
							Specific subtypes override DA/EVAL/DAEVAL, which override Default.
							Age-specific rows override the age-agnostic rows. Values are in
							hours (e.g. 1.5 = 90 min).
						</p>
					</div>

					<div className="flex items-center justify-between pt-4">
						{showArchiveButton ? (
							<Button
								disabled={!canEdit}
								onClick={() => setIsArchiveDialogOpen(true)}
								size="sm"
								type="button"
								variant={evaluator.archived ? "outline" : "destructive"}
							>
								{evaluator.archived ? "Unarchive Profile" : "Archive Profile"}
							</Button>
						) : (
							<div />
						)}
						<Button
							disabled={updateEvaluator.isPending || !canEdit}
							type="submit"
						>
							{updateEvaluator.isPending ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Saving...
								</>
							) : (
								"Save Profile"
							)}
						</Button>
					</div>
				</form>
			</Form>

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
