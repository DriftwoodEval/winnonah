"use client";

import { Button } from "@ui/button";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { api } from "~/trpc/react";

interface SelectHealthFormButtonProps {
	clientId: number;
}

export function SelectHealthFormButton({
	clientId,
}: SelectHealthFormButtonProps) {
	const mutation = api.clients.downloadSelectHealthForm.useMutation({
		onError: (e: { message: string }) =>
			toast.error("Failed to download form", { description: e.message }),
	});

	const handleDownload = async () => {
		const base64 = await mutation.mutateAsync({ clientId });
		const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
		const blob = new Blob([bytes], { type: "application/pdf" });
		const url = URL.createObjectURL(blob);
		const a = Object.assign(document.createElement("a"), {
			href: url,
			download: `select-health-${clientId}.pdf`,
		});
		document.body.appendChild(a);
		a.click();
		URL.revokeObjectURL(url);
		a.remove();
		toast.success("Select Health PA form downloaded");
	};

	return (
		<Button
			disabled={mutation.isPending}
			onClick={handleDownload}
			size="sm"
			variant="outline"
		>
			{mutation.isPending ? (
				<Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
			) : (
				<DownloadIcon className="mr-2 h-4 w-4" />
			)}
			Select Health PA Form
		</Button>
	);
}
