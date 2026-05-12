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
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";

export default function GreeterProxyTab() {
	const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
	const utils = api.useUtils();

	const { data: status, isLoading } = api.greeterProxy.getStatus.useQuery();

	const { mutate: resetStatus, isPending: isResetting } =
		api.greeterProxy.resetStatus.useMutation({
			onSuccess: () => {
				utils.greeterProxy.getStatus.invalidate();
				setIsResetDialogOpen(false);
				toast.success("Greeter proxy reset to idle");
			},
			onError: (error) => {
				toast.error("Failed to reset status", {
					description: String(error.message),
					duration: 10000,
				});
			},
		});

	return (
		<div className="px-4">
			<h3 className="pb-4 font-bold text-lg">Greeter Proxy</h3>
			<Card className="max-w-md">
				<CardHeader>
					<CardTitle className="text-base">Active Conversation</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{isLoading ? (
						<p className="text-muted-foreground text-sm">Loading...</p>
					) : status?.active && status.evaluator ? (
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<Badge>Active</Badge>
								<span className="font-medium">{status.evaluator.name}</span>
							</div>
							{status.evaluator.phoneNumber && (
								<p className="text-muted-foreground text-sm">
									{status.evaluator.phoneNumber}
								</p>
							)}
							<p className="text-muted-foreground text-sm">
								Greeter replies are currently routing to this evaluator.
							</p>
						</div>
					) : (
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<Badge variant="secondary">Idle</Badge>
							</div>
							<p className="text-muted-foreground text-sm">
								No active evaluator. Greeter replies will not route until an
								evaluator sends a message.
							</p>
						</div>
					)}
					<Button
						className="gap-2"
						disabled={!status?.active || isResetting}
						onClick={() => setIsResetDialogOpen(true)}
						size="sm"
						variant="outline"
					>
						<RefreshCw className="h-4 w-4" />
						Reset to Idle
					</Button>
				</CardContent>
			</Card>

			<AlertDialog onOpenChange={setIsResetDialogOpen} open={isResetDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Reset greeter proxy?</AlertDialogTitle>
						<AlertDialogDescription>
							This clears the active evaluator. Greeter replies will not route
							until an evaluator sends the next message.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={isResetting}
							onClick={() => resetStatus()}
						>
							{isResetting ? "Resetting..." : "Reset"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
