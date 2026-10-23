"use client";

import { Button } from "@ui/button";
import { Bug, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { IssueReportDialog } from "./IssueReportDialog";

// Screenshots are scaled down to this width so the email stays small.
const MAX_SCREENSHOT_WIDTH = 1600;

/** Renders the current page to a PNG data URL, or null if it cannot be captured. */
async function capturePage(): Promise<string | null> {
	const { toPng } = await import("html-to-image");
	const width = window.innerWidth;
	const height = window.innerHeight;
	try {
		return await toPng(document.body, {
			width,
			height,
			canvasWidth: Math.min(width, MAX_SCREENSHOT_WIDTH),
			canvasHeight: Math.round(
				height * (Math.min(width, MAX_SCREENSHOT_WIDTH) / width),
			),
			pixelRatio: 1,
			backgroundColor: getComputedStyle(document.body).backgroundColor,
			cacheBust: true,
		});
	} catch {
		return null;
	}
}

export function IssueReportButton() {
	const [capturing, setCapturing] = useState(false);
	const [screenshot, setScreenshot] = useState<string | null>(null);
	const [open, setOpen] = useState(false);
	const [pageUrl, setPageUrl] = useState("");

	const startReport = async () => {
		setCapturing(true);
		const image = await capturePage();
		setCapturing(false);
		if (!image) {
			toast.warning("Could not capture a screenshot", {
				description: "You can still send the report without one.",
			});
		}
		setScreenshot(image);
		setPageUrl(window.location.href);
		setOpen(true);
	};

	return (
		<>
			{/*
			 * Pressing this button must not dismiss an open menu, popover, or
			 * dialog, so the screenshot can include it. Stopping the pointer event
			 * keeps Radix from seeing an outside click, and preventing the mouse
			 * down keeps focus where it was. `data-keep-clickable` lifts the button
			 * above a modal's overlay (see globals.css).
			 */}
			<Button
				className="pointer-events-auto cursor-pointer rounded-full"
				data-keep-clickable
				disabled={capturing}
				onClick={startReport}
				onMouseDown={(event) => event.preventDefault()}
				onPointerDown={(event) => event.stopPropagation()}
				size="icon"
				variant="ghost"
			>
				{capturing ? <Loader2 className="animate-spin" /> : <Bug />}
				<span className="sr-only">Report issue</span>
			</Button>
			<IssueReportDialog
				onOpenChange={setOpen}
				open={open}
				pageUrl={pageUrl}
				screenshot={screenshot}
			/>
		</>
	);
}
