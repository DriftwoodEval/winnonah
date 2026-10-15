"use client";

import { useLightbox } from "@components/shared/ImageLightbox";

/** Splits an optional `#w=<pixels>` display width off an image URL. */
function parseImageSrc(src: string) {
	const [path = "", fragment = ""] = src.split("#");
	const width = Number(new URLSearchParams(fragment).get("w")) || undefined;
	return { path, width };
}

export function DocsImage(props: React.ComponentProps<"img">) {
	const { openLightbox } = useLightbox();
	const { src: rawSrc, alt = "", ...rest } = props;

	if (!rawSrc) return null;
	const { path: src, width } = parseImageSrc(rawSrc as string);

	return (
		<button
			className="block max-w-full cursor-zoom-in"
			onClick={() => openLightbox({ src, alt })}
			style={{ width: width ?? "100%" }}
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
