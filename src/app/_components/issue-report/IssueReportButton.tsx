"use client";

import { Button } from "@ui/button";
import { Bug, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

/** Whether a modal dialog or menu currently blocks clicks on the page. */
function isPageBlocked() {
	return (
		document.body.hasAttribute("data-scroll-locked") ||
		document.body.style.pointerEvents === "none"
	);
}

function useIsPageBlocked() {
	const [blocked, setBlocked] = useState(false);

	useEffect(() => {
		const update = () => setBlocked(isPageBlocked());
		update();
		const observer = new MutationObserver(update);
		observer.observe(document.body, {
			attributes: true,
			attributeFilter: ["style", "data-scroll-locked"],
		});
		return () => observer.disconnect();
	}, []);

	return blocked;
}

export function IssueReportButton() {
	const slotRef = useRef<HTMLSpanElement>(null);
	const pageBlocked = useIsPageBlocked();
	const [slotRect, setSlotRect] = useState<DOMRect | null>(null);
	const [capturing, setCapturing] = useState(false);
	const [screenshot, setScreenshot] = useState<string | null>(null);
	const [open, setOpen] = useState(false);
	const [pageUrl, setPageUrl] = useState("");

	// While a modal blocks the header, the button is drawn from a portal on top
	// of the overlay at the header slot's position.
	useEffect(() => {
		setSlotRect(
			pageBlocked ? (slotRef.current?.getBoundingClientRect() ?? null) : null,
		);
	}, [pageBlocked]);

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

	// Pressing the button must not dismiss an open menu, popover, or dialog, so
	// the screenshot can include it. Stopping the pointer event keeps Radix from
	// seeing an outside click, and preventing the mouse down keeps focus where
	// it was.
	const button = (
		<Button
			className="pointer-events-auto cursor-pointer rounded-full"
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
	);

	// The report dialog has its own overlay, so the button goes back under it
	// and blurs with the rest of the page.
	const floating = !!slotRect && !open;

	return (
		<>
			<span className="inline-flex size-8" ref={slotRef}>
				{!floating && button}
			</span>
			{floating &&
				createPortal(
					<div
						className="pointer-events-auto fixed z-[100] rounded-full bg-background"
						style={{ top: slotRect.top, left: slotRect.left }}
					>
						{button}
					</div>,
					document.body,
				)}
			<IssueReportDialog
				onOpenChange={setOpen}
				open={open}
				pageUrl={pageUrl}
				screenshot={screenshot}
			/>
		</>
	);
}
