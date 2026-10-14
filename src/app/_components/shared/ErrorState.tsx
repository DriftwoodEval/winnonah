import { Button } from "@ui/button";
import { AlertTriangle } from "lucide-react";
import { cn } from "~/lib/utils";

interface ErrorStateProps {
	/** What went wrong, in plain language. */
	message?: string;
	/** Shows a "Try again" button when provided, usually a query's `refetch`. */
	onRetry?: () => void;
	/** Tighter spacing for widgets and table bodies. */
	compact?: boolean;
	className?: string;
}

export function ErrorState({
	message = "Something went wrong while loading this.",
	onRetry,
	compact = false,
	className,
}: ErrorStateProps) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center text-center",
				compact ? "gap-1 p-3" : "gap-2 p-8",
				className,
			)}
			role="alert"
		>
			<AlertTriangle
				className={cn("text-destructive", compact ? "size-5" : "size-8")}
			/>
			<p className="text-sm">{message}</p>
			{onRetry && (
				<Button
					className="mt-1"
					onClick={() => onRetry()}
					size="sm"
					type="button"
					variant="outline"
				>
					Try again
				</Button>
			)}
		</div>
	);
}
