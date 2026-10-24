"use client";

import { Button } from "@ui/button";
import { ArrowUpRight, Pencil, Square, Trash2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";

type Tool = "pen" | "rectangle" | "arrow";

interface Point {
	x: number;
	y: number;
}

export type Shape =
	| { tool: "pen"; color: string; points: Point[] }
	| { tool: "rectangle" | "arrow"; color: string; start: Point; end: Point };

/** A captured page plus the markup drawn on it so far. */
export interface DraftImage {
	id: string;
	/** Data URL of the unmarked screenshot. */
	src: string;
	pageUrl: string;
	shapes: Shape[];
}

// Drawing colors are canvas pixel data, so they are literal values.
const COLORS = ["#e11d48", "#2563eb", "#16a34a", "#111827"];

const TOOLS: { id: Tool; label: string; Icon: typeof Pencil }[] = [
	{ id: "pen", label: "Pen", Icon: Pencil },
	{ id: "rectangle", label: "Rectangle", Icon: Square },
	{ id: "arrow", label: "Arrow", Icon: ArrowUpRight },
];

function drawArrow(ctx: CanvasRenderingContext2D, start: Point, end: Point) {
	const headLength = 6 * ctx.lineWidth;
	const angle = Math.atan2(end.y - start.y, end.x - start.x);
	ctx.beginPath();
	ctx.moveTo(start.x, start.y);
	ctx.lineTo(end.x, end.y);
	for (const offset of [Math.PI / 7, -Math.PI / 7]) {
		ctx.moveTo(end.x, end.y);
		ctx.lineTo(
			end.x - headLength * Math.cos(angle - offset),
			end.y - headLength * Math.sin(angle - offset),
		);
	}
	ctx.stroke();
}

function drawShape(
	ctx: CanvasRenderingContext2D,
	shape: Shape,
	lineWidth: number,
) {
	ctx.strokeStyle = shape.color;
	ctx.lineWidth = lineWidth;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";

	if (shape.tool === "pen") {
		const [first, ...rest] = shape.points;
		if (!first) return;
		ctx.beginPath();
		ctx.moveTo(first.x, first.y);
		if (rest.length === 0) ctx.lineTo(first.x, first.y);
		for (const point of rest) ctx.lineTo(point.x, point.y);
		ctx.stroke();
	} else if (shape.tool === "rectangle") {
		ctx.strokeRect(
			shape.start.x,
			shape.start.y,
			shape.end.x - shape.start.x,
			shape.end.y - shape.start.y,
		);
	} else {
		drawArrow(ctx, shape.start, shape.end);
	}
}

function loadImage(src: string) {
	return new Promise<HTMLImageElement>((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error("Could not load the screenshot"));
		image.src = src;
	});
}

/** Draws the screenshot and its markup onto a canvas, sized to the screenshot. */
function paint(
	canvas: HTMLCanvasElement,
	image: HTMLImageElement,
	shapes: Shape[],
) {
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	canvas.width = image.naturalWidth;
	canvas.height = image.naturalHeight;
	ctx.drawImage(image, 0, 0);

	const lineWidth = Math.max(3, Math.round(canvas.width / 400));
	for (const shape of shapes) drawShape(ctx, shape, lineWidth);
}

/** The screenshot with its markup burned in, as base64 JPEG without the prefix. */
export async function renderMarkedUpJpeg({ src, shapes }: DraftImage) {
	const canvas = document.createElement("canvas");
	paint(canvas, await loadImage(src), shapes);
	return canvas.toDataURL("image/jpeg", 0.6).split(",")[1] ?? "";
}

interface ScreenshotEditorProps {
	image: DraftImage;
	onShapesChange: (shapes: Shape[]) => void;
}

/** Mount with `key={image.id}` so switching screenshots resets the tool state. */
export function ScreenshotEditor({
	image,
	onShapesChange,
}: ScreenshotEditorProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const loadedImageRef = useRef<HTMLImageElement | null>(null);
	const [draft, setDraft] = useState<Shape | null>(null);
	const [tool, setTool] = useState<Tool>("pen");
	const [color, setColor] = useState(COLORS[0] ?? "#e11d48");
	const [imageLoaded, setImageLoaded] = useState(false);
	const shapes = image.shapes;

	useEffect(() => {
		loadImage(image.src).then((loaded) => {
			loadedImageRef.current = loaded;
			setImageLoaded(true);
		});
	}, [image.src]);

	const redraw = useCallback(() => {
		const canvas = canvasRef.current;
		const loaded = loadedImageRef.current;
		if (!canvas || !loaded) return;
		paint(canvas, loaded, draft ? [...shapes, draft] : shapes);
	}, [shapes, draft]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: redraw when the image finishes loading
	useEffect(redraw, [redraw, imageLoaded]);

	const toCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
		const canvas = event.currentTarget;
		const rect = canvas.getBoundingClientRect();
		return {
			x: ((event.clientX - rect.left) / rect.width) * canvas.width,
			y: ((event.clientY - rect.top) / rect.height) * canvas.height,
		};
	};

	const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
		event.currentTarget.setPointerCapture(event.pointerId);
		const point = toCanvasPoint(event);
		setDraft(
			tool === "pen"
				? { tool, color, points: [point] }
				: { tool, color, start: point, end: point },
		);
	};

	const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
		if (!draft) return;
		const point = toCanvasPoint(event);
		setDraft(
			draft.tool === "pen"
				? { ...draft, points: [...draft.points, point] }
				: { ...draft, end: point },
		);
	};

	const finishDraft = () => {
		if (draft) onShapesChange([...shapes, draft]);
		setDraft(null);
	};

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2">
				{TOOLS.map(({ id, label, Icon }) => (
					<Button
						aria-pressed={tool === id}
						key={id}
						onClick={() => setTool(id)}
						size="sm"
						type="button"
						variant={tool === id ? "secondary" : "outline"}
					>
						<Icon />
						{label}
					</Button>
				))}
				<div className="flex items-center gap-1">
					{COLORS.map((swatch) => (
						<button
							aria-label={`Use color ${swatch}`}
							className={cn(
								"h-6 w-6 rounded-full border-2",
								color === swatch ? "border-foreground" : "border-transparent",
							)}
							key={swatch}
							onClick={() => setColor(swatch)}
							style={{ backgroundColor: swatch }}
							type="button"
						/>
					))}
				</div>
				<div className="ml-auto flex gap-2">
					<Button
						disabled={shapes.length === 0}
						onClick={() => onShapesChange(shapes.slice(0, -1))}
						size="sm"
						type="button"
						variant="outline"
					>
						<Undo2 />
						Undo
					</Button>
					<Button
						disabled={shapes.length === 0}
						onClick={() => onShapesChange([])}
						size="sm"
						type="button"
						variant="outline"
					>
						<Trash2 />
						Clear
					</Button>
				</div>
			</div>
			<canvas
				className="max-h-[65vh] w-full cursor-crosshair touch-none rounded-md border object-contain"
				onPointerCancel={finishDraft}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={finishDraft}
				ref={canvasRef}
			/>
		</div>
	);
}
