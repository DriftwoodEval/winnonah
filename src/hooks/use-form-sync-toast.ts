import { useEffect, useRef } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

/**
 * Keeps a react-hook-form in sync with polled query data. The first time
 * data arrives it populates the form. After that, if the form is untouched
 * it's safe to reset silently, but if the user has unsaved edits a silent
 * reset would wipe them out, so this shows a toast with a "Reload" action
 * instead of resetting underneath them.
 */
export function useFormSyncToast<TData, TFormValues extends FieldValues>(
	data: TData | null | undefined,
	form: UseFormReturn<TFormValues>,
	resetForm: (data: TData) => void,
	message = "This data was updated elsewhere.",
) {
	const initialized = useRef(false);
	const resetFormRef = useRef(resetForm);
	resetFormRef.current = resetForm;

	// biome-ignore lint/correctness/useExhaustiveDependencies: only data changes should trigger a re-sync, isDirty is read fresh at that moment
	useEffect(() => {
		if (data == null) return;

		if (!initialized.current) {
			initialized.current = true;
			resetFormRef.current(data);
			return;
		}

		if (form.formState.isDirty) {
			toast.info(message, {
				id: "form-sync-reload",
				action: {
					label: "Reload",
					onClick: () => resetFormRef.current(data),
				},
			});
		} else {
			resetFormRef.current(data);
		}
	}, [data]);
}
