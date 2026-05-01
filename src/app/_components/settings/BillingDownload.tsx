"use client";

import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import { DownloadIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "~/trpc/react";

export default function BillingDownload() {
	const downloadMutation = api.clients.downloadBilling.useMutation();

	const handleDownload = async () => {
		try {
			const csvData = await downloadMutation.mutateAsync();
			const blob = new Blob([csvData], { type: "text/csv" });
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "clients-billing.csv";
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			document.body.removeChild(a);
			toast.success("Billing CSV downloaded successfully");
		} catch (error) {
			toast.error("Failed to download billing CSV", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		}
	};

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardContent>
					<Button
						disabled={downloadMutation.isPending}
						onClick={handleDownload}
					>
						{downloadMutation.isPending ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<DownloadIcon className="mr-2 h-4 w-4" />
						)}
						Download Billing CSV
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
