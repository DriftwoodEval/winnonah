import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import { TriangleAlertIcon } from "lucide-react";

export function NeedsCleanupNotice() {
	return (
		<Alert className="not-prose mb-6">
			<TriangleAlertIcon />
			<AlertTitle>This page is still rough</AlertTitle>
			<AlertDescription>
				It's overly technical and hasn't been cleaned up yet for user
				understanding, and it's still missing screenshots.
			</AlertDescription>
		</Alert>
	);
}
