import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

interface EmptyStateProps {
	title: string;
	description?: string;
	icon?: LucideIcon;
	/** Optional call to action, usually a Button. */
	action?: ReactNode;
	/** Tighter spacing for widgets and table bodies. */
	compact?: boolean;
	className?: string;
}

export function EmptyState({
	title,
	description,
	icon: Icon,
	action,
	compact = false,
	className,
}: EmptyStateProps) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center text-center text-muted-foreground",
				compact ? "gap-1 p-3" : "gap-2 p-8",
				className,
			)}
		>
			{Icon && <Icon className={compact ? "size-5" : "size-8"} />}
			<p className={cn("font-medium", compact ? "text-sm" : "text-base")}>
				{title}
			</p>
			{description && <p className="max-w-sm text-sm">{description}</p>}
			{action && <div className="mt-2">{action}</div>}
		</div>
	);
}
