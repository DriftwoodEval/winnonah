import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import { TriangleAlertIcon } from "lucide-react";

const VARIANTS = {
	needsCleanup: {
		title: "This page is still rough",
		description:
			"It's overly technical and hasn't been cleaned up yet for user understanding, and it's still missing screenshots.",
	},
	notDone: {
		title: "This page is a work in progress",
		description: "We haven't finished writing it yet.",
	},
};

export function DocStatusNotice({
	variant,
}: {
	variant: keyof typeof VARIANTS;
}) {
	const { title, description } = VARIANTS[variant];

	return (
		<Alert className="not-prose mb-6">
			<TriangleAlertIcon />
			<AlertTitle>{title}</AlertTitle>
			<AlertDescription>{description}</AlertDescription>
		</Alert>
	);
}
