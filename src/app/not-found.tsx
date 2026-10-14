import { Button } from "@ui/button";
import { FileQuestion } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
	return (
		<div className="flex w-full flex-col items-center justify-center gap-4 p-8 text-center">
			<FileQuestion className="size-10 text-muted-foreground" />
			<h1 className="font-semibold text-xl">Page not found</h1>
			<p className="max-w-md text-muted-foreground text-sm">
				The page you are looking for does not exist or has moved.
			</p>
			<Button asChild>
				<Link href="/">Go home</Link>
			</Button>
		</div>
	);
}
