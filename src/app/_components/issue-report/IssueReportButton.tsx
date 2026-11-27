"use client";

import { Button } from "@ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@ui/hover-card";
import { Bug, Lightbulb, ListChecks, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { MAX_ISSUE_REPORT_SCREENSHOTS } from "~/lib/validations/config";
import { IssueReportDialog, type IssueReportForm } from "./IssueReportDialog";
import type { DraftImage, Shape } from "./ScreenshotEditor";

// Screenshots are scaled down to this width so the email stays small.
const MAX_SCREENSHOT_WIDTH = 1600;

/**
 * Takes a real screenshot of the current tab with the browser's screen capture,
 * so nothing on the page has to be copied or re-rendered. The browser asks the
 * user to allow sharing the tab each time. Returns a PNG data URL, or null if
 * the user declines or the browser cannot capture.
 */
async function capturePage(): Promise<string | null> {
	let stream: MediaStream | null = null;
	const hidden = Array.from(
		document.querySelectorAll<HTMLElement>("[data-issue-report-ignore]"),
	);
	try {
		stream = await navigator.mediaDevices.getDisplayMedia({
			video: true,
			preferCurrentTab: true,
		} as DisplayMediaStreamOptions);

		// The draft bar is not part of the page being reported.
		for (const el of hidden) el.style.visibility = "hidden";

		const video = document.createElement("video");
		video.muted = true;
		video.srcObject = stream;
		// The play() promise can stay pending while frames are already flowing, so
		// it is not awaited.
		void video.play();
		// Tab capture only sends frames when the page changes, so wait for the
		// first one, then give the hidden draft bar a moment to leave the picture.
		await new Promise((resolve) => video.requestVideoFrameCallback(resolve));
		await new Promise((resolve) => setTimeout(resolve, 250));

		const scale = Math.min(1, MAX_SCREENSHOT_WIDTH / video.videoWidth);
		const canvas = document.createElement("canvas");
		canvas.width = Math.round(video.videoWidth * scale);
		canvas.height = Math.round(video.videoHeight * scale);
		canvas
			.getContext("2d")
			?.drawImage(video, 0, 0, canvas.width, canvas.height);
		return canvas.toDataURL("image/png");
	} catch (error) {
		// NotAllowedError means the user closed the share prompt.
		if (!(error instanceof DOMException && error.name === "NotAllowedError")) {
			console.error("Issue report screenshot failed", error);
		}
		return null;
	} finally {
		for (const el of hidden) el.style.visibility = "";
		for (const track of stream?.getTracks() ?? []) track.stop();
	}
}

const EMPTY_FORM: IssueReportForm = {
	type: "bug",
	subject: "",
	body: "",
	priority: "Medium",
	ccEmails: [],
};

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

/**
 * Stops pointer presses on the report button from reaching the document, where
 * an open dialog or popover would treat them as an outside click and close
 * before the screenshot is taken. The listener sits on the button itself so it
 * runs before any document-level listener.
 */
function keepOverlaysOpen(button: HTMLElement | null) {
	if (!button) return;
	const stop = (event: Event) => event.stopPropagation();
	button.addEventListener("pointerdown", stop);
	return () => button.removeEventListener("pointerdown", stop);
}

function readAsDataUrl(file: File) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
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
	const [menuOpen, setMenuOpen] = useState(false);

	// While a modal blocks the header, the button is drawn from a portal on top
	// of the overlay at the header slot's position.
	useEffect(() => {
		setSlotRect(
			pageBlocked ? (slotRef.current?.getBoundingClientRect() ?? null) : null,
		);
	}, [pageBlocked]);

	// The draft lives here, in the header, so it survives client-side
	// navigation. That lets a report collect screenshots from several pages.
	const captureScreenshot = async () => {
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
					"Bug reports need a screenshot. Try again and allow sharing this tab, or add an image file instead.",
			});
		}
		setOpen(true);
	};

	const startBug = () => {
		setMenuOpen(false);
		setForm((current) => ({ ...current, type: "bug" }));
		void captureScreenshot();
	};

	// Feature requests do not need a screenshot, so the dialog opens right away.
	const startFeature = () => {
		setMenuOpen(false);
		setForm((current) => ({ ...current, type: "feature" }));
		setOpen(true);
	};

	const addAnother = () => {
		setOpen(false);
		toast.info("Go to another page, then add its screenshot", {
			description:
				"Use the bug icon or the Add screenshot button at the bottom of the page.",
		});
	};

	// Uploaded files join the draft like captured screenshots, so they can be
	// marked up and are re-encoded as JPEG on send.
	const uploadImages = async (files: File[]) => {
		const room = MAX_ISSUE_REPORT_SCREENSHOTS - images.length;
		const accepted = files.filter((file) => file.type.startsWith("image/"));
		if (accepted.length < files.length) {
			toast.warning("Only image files can be added");
		}
		if (accepted.length > room) {
			toast.warning(
				`A report can include up to ${MAX_ISSUE_REPORT_SCREENSHOTS} images`,
			);
		}

		const added: DraftImage[] = [];
		for (const file of accepted.slice(0, Math.max(room, 0))) {
			try {
				added.push({
					id: crypto.randomUUID(),
					src: await readAsDataUrl(file),
					pageUrl: window.location.href,
					shapes: [],
				});
			} catch {
				toast.error(`Could not read ${file.name}`);
			}
		}
		if (added.length === 0) return;
		setImages((current) => [...current, ...added]);
		setSelectedId(added[0]?.id ?? null);
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
	// seeing an outside click (see keepOverlaysOpen), and preventing the mouse
	// down keeps focus where it was.
	//
	// Hovering the icon also opens a menu of the other report types. The menu is
	// left out of screenshots and sits above any modal overlay like the button.
	const menuItemClass =
		"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent";
	const button = (
		<HoverCard
			closeDelay={150}
			onOpenChange={setMenuOpen}
			open={menuOpen}
			openDelay={100}
		>
			<HoverCardTrigger asChild>
				<Button
					className="pointer-events-auto cursor-pointer rounded-full max-md:size-8"
					disabled={capturing}
					onClick={startBug}
					onMouseDown={(event) => event.preventDefault()}
					ref={keepOverlaysOpen}
					size="icon"
					variant="ghost"
				>
					{capturing ? <Loader2 className="animate-spin" /> : <Bug />}
					<span className="sr-only">Report issue</span>
				</Button>
			</HoverCardTrigger>
			<HoverCardContent
				align="end"
				className="pointer-events-auto z-[100] w-52 p-1"
				data-issue-report-ignore
			>
				<button className={menuItemClass} onClick={startBug} type="button">
					<Bug className="size-4" />
					Create bug report
				</button>
				<button className={menuItemClass} onClick={startFeature} type="button">
					<Lightbulb className="size-4" />
					Create feature request
				</button>
				<Link
					className={menuItemClass}
					href="/issue-reports"
					onClick={() => setMenuOpen(false)}
				>
					<ListChecks className="size-4" />
					My bug reports
				</Link>
			</HoverCardContent>
		</HoverCard>
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
					className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-popover px-4 py-2 text-sm text-popover-foreground shadow-md"
					data-issue-report-ignore
				>
					<span>
						Report in progress ({images.length}{" "}
						{images.length === 1 ? "screenshot" : "screenshots"})
					</span>
					<Button
						disabled={capturing}
						onClick={captureScreenshot}
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
				onUploadImages={uploadImages}
				open={open}
				selectedId={selectedId}
			/>
		</>
	);
}
