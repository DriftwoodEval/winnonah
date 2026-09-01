import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import {
	BugIcon,
	CheckIcon,
	CircleCheckIcon,
	CircleHelpIcon,
	ClipboardListIcon,
	InfoIcon,
	LightbulbIcon,
	ListIcon,
	type LucideIcon,
	OctagonAlertIcon,
	PencilIcon,
	QuoteIcon,
	StarIcon,
	TriangleAlertIcon,
	XIcon,
	ZapIcon,
} from "lucide-react";
import { resolveCalloutType } from "~/lib/callout-types.mjs";
import { cn } from "~/lib/utils";

type CalloutType =
	| "note"
	| "abstract"
	| "info"
	| "todo"
	| "tip"
	| "success"
	| "question"
	| "warning"
	| "important"
	| "caution"
	| "failure"
	| "danger"
	| "bug"
	| "example"
	| "quote";

interface CalloutStyle {
	icon: LucideIcon;
	label: string;
	className: string;
}

// Each color family is one of our named tokens (see src/styles/globals.css),
// never a raw Tailwind palette color.
const FAMILIES = {
	neutral: "border-border bg-muted/40 *:[svg]:text-muted-foreground",
	info: "border-info/40 bg-info/10 *:[svg]:text-info",
	success: "border-success/40 bg-success/10 *:[svg]:text-success",
	brand: "border-primary/40 bg-primary/10 *:[svg]:text-primary",
	warning: "border-warning/40 bg-warning/10 *:[svg]:text-warning",
	error: "border-error/40 bg-error/10 *:[svg]:text-error",
} as const;

const CALLOUT_STYLES: Record<CalloutType, CalloutStyle> = {
	note: { icon: PencilIcon, label: "Note", className: FAMILIES.neutral },
	abstract: {
		icon: ClipboardListIcon,
		label: "Abstract",
		className: FAMILIES.info,
	},
	info: { icon: InfoIcon, label: "Info", className: FAMILIES.info },
	todo: { icon: CircleCheckIcon, label: "To-do", className: FAMILIES.info },
	tip: { icon: LightbulbIcon, label: "Tip", className: FAMILIES.success },
	success: { icon: CheckIcon, label: "Success", className: FAMILIES.success },
	question: {
		icon: CircleHelpIcon,
		label: "Question",
		className: FAMILIES.brand,
	},
	warning: {
		icon: TriangleAlertIcon,
		label: "Warning",
		className: FAMILIES.warning,
	},
	important: { icon: StarIcon, label: "Important", className: FAMILIES.brand },
	caution: {
		icon: OctagonAlertIcon,
		label: "Caution",
		className: FAMILIES.warning,
	},
	failure: { icon: XIcon, label: "Failure", className: FAMILIES.error },
	danger: { icon: ZapIcon, label: "Danger", className: FAMILIES.error },
	bug: { icon: BugIcon, label: "Bug", className: FAMILIES.error },
	example: { icon: ListIcon, label: "Example", className: FAMILIES.brand },
	quote: { icon: QuoteIcon, label: "Quote", className: FAMILIES.neutral },
};

interface CalloutProps {
	type?: string;
	title?: string;
	children: React.ReactNode;
}

/**
 * Highlighted aside for the docs site. Authors can write it either as an MDX
 * element (`<Callout type="tip">...</Callout>`) or as a GitHub-style alert
 * blockquote (`> [!TIP]`), which `remark-docs-callouts` rewrites into this.
 * `type` accepts any canonical name or alias from `callout-types.mjs`.
 */
export function Callout({ type = "note", title, children }: CalloutProps) {
	const resolved = (resolveCalloutType(type) ?? "note") as CalloutType;
	const style = CALLOUT_STYLES[resolved];
	const Icon = style.icon;

	return (
		<Alert className={cn("not-prose my-6", style.className)}>
			<Icon />
			<AlertTitle>{title ?? style.label}</AlertTitle>
			<AlertDescription className="text-foreground [&_a]:underline">
				{children}
			</AlertDescription>
		</Alert>
	);
}
