"use client";

import { useLightbox } from "@components/shared/ImageLightbox";

/** Splits the optional `#w=<pixels>` display width and `inline` flag off an image URL. */
function parseImageSrc(src: string) {
	const [path = "", fragment = ""] = src.split("#");
	const params = new URLSearchParams(fragment);
	const width = Number(params.get("w")) || undefined;
	return { path, width, inline: params.has("inline") };
}

export function DocsImage(props: React.ComponentProps<"img">) {
	const { openLightbox } = useLightbox();
	const { src: rawSrc, alt = "", ...rest } = props;

	if (!rawSrc) return null;
	const { path: src, width, inline } = parseImageSrc(rawSrc as string);

	return (
		<button
			className={`max-w-full cursor-zoom-in ${inline ? "inline-block align-middle" : "block"}`}
			onClick={() => openLightbox({ src, alt })}
			style={{ width: width ?? (inline ? "auto" : "100%") }}
			type="button"
		>
			{/* biome-ignore lint/performance/noImgElement: doc images are arbitrary local files served through a route handler, not next/image compatible without known dimensions */}
			<img
				{...rest}
				alt={alt}
				className="w-full rounded-lg transition-opacity hover:opacity-80"
				src={src}
			/>
		</button>
	);
}
