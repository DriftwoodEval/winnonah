"use client";

import { Button } from "@ui/button";
import { Bug, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { MAX_ISSUE_REPORT_SCREENSHOTS } from "~/lib/validations/config";
import { IssueReportDialog, type IssueReportForm } from "./IssueReportDialog";
import type { DraftImage, Shape } from "./ScreenshotEditor";

// Screenshots are scaled down to this width so the email stays small.
const MAX_SCREENSHOT_WIDTH = 1600;

// A 1x1 transparent GIF drawn in place of an image that cannot be fetched.
const BLANK_IMAGE =
	"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * Renders the current page to a PNG data URL, or null if it cannot be captured.
 * A failed first attempt is retried without web fonts and with a placeholder for
 * images that fail to load, which are the usual causes of a failed render.
 */
async function capturePage(): Promise<string | null> {
	const { toPng } = await import("html-to-image");
	const width = window.innerWidth;
	const height = window.innerHeight;
	const canvasWidth = Math.min(width, MAX_SCREENSHOT_WIDTH);
	const options = {
		width,
		height,
		canvasWidth,
		canvasHeight: Math.round(height * (canvasWidth / width)),
		pixelRatio: 1,
		backgroundColor: getComputedStyle(document.body).backgroundColor,
		// The draft bar is not part of the page being reported.
		filter: (node: HTMLElement) =>
			!("issueReportIgnore" in (node.dataset ?? {})),
	};

	const attempts = [
		{ ...options, cacheBust: true },
		{ ...options, skipFonts: true, imagePlaceholder: BLANK_IMAGE },
	];
	for (const attempt of attempts) {
		try {
			return await toPng(document.body, attempt);
		} catch (error) {
			console.error("Issue report screenshot failed", error);
		}
	}
	return null;
}

const EMPTY_FORM: IssueReportForm = { subject: "", body: "", ccEmails: [] };

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
	const [images, setImages] = useState<DraftImage[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [form, setForm] = useState<IssueReportForm>(EMPTY_FORM);
	const [open, setOpen] = useState(false);

	// While a modal blocks the header, the button is drawn from a portal on top
	// of the overlay at the header slot's position.
	useEffect(() => {
		setSlotRect(
			pageBlocked ? (slotRef.current?.getBoundingClientRect() ?? null) : null,
		);
	}, [pageBlocked]);

	// The draft lives here, in the header, so it survives client-side
	// navigation. That lets a report collect screenshots from several pages.
	const startReport = async () => {
		if (images.length >= MAX_ISSUE_REPORT_SCREENSHOTS) {
			toast.warning(
				`A report can include up to ${MAX_ISSUE_REPORT_SCREENSHOTS} screenshots`,
			);
			setOpen(true);
			return;
		}

		setCapturing(true);
		const src = await capturePage();
		setCapturing(false);
		if (src) {
			const id = crypto.randomUUID();
			setImages((current) => [
				...current,
				{ id, src, pageUrl: window.location.href, shapes: [] },
			]);
			setSelectedId(id);
		} else {
			toast.warning("Could not capture a screenshot", {
				description:
					"You can still send the report. It will say no screenshot is attached.",
			});
		}
		setOpen(true);
	};

	const addAnother = () => {
		setOpen(false);
		toast.info("Go to another page, then add its screenshot", {
			description:
				"Use the bug icon or the Add screenshot button at the bottom of the page.",
		});
	};

	const discard = () => {
		setOpen(false);
		setImages([]);
		setSelectedId(null);
		setForm(EMPTY_FORM);
	};

	const removeImage = (id: string) => {
		const remaining = images.filter((image) => image.id !== id);
		setImages(remaining);
		if (id === selectedId) setSelectedId(remaining.at(-1)?.id ?? null);
	};

	const updateShapes = (id: string, shapes: Shape[]) => {
		setImages((current) =>
			current.map((image) => (image.id === id ? { ...image, shapes } : image)),
		);
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
			{!open && images.length > 0 && (
				<div
					className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-popover px-4 py-2 text-popover-foreground text-sm shadow-md"
					data-issue-report-ignore
				>
					<span>
						Report in progress ({images.length}{" "}
						{images.length === 1 ? "screenshot" : "screenshots"})
					</span>
					<Button
						disabled={capturing}
						onClick={startReport}
						size="sm"
						variant="outline"
					>
						Add screenshot
					</Button>
					<Button onClick={() => setOpen(true)} size="sm">
						Resume
					</Button>
					<Button onClick={discard} size="sm" variant="ghost">
						Discard
					</Button>
				</div>
			)}
			<IssueReportDialog
				form={form}
				images={images}
				onAddAnother={addAnother}
				onDiscard={discard}
				onFormChange={(patch) =>
					setForm((current) => ({ ...current, ...patch }))
				}
				onOpenChange={setOpen}
				onRemoveImage={removeImage}
				onSelect={setSelectedId}
				onSent={discard}
				onShapesChange={updateShapes}
				open={open}
				selectedId={selectedId}
			/>
		</>
	);
}
