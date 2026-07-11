"use client";

import { useLightbox } from "@components/shared/ImageLightbox";

export function DocsImage(props: React.ComponentProps<"img">) {
	const { openLightbox } = useLightbox();
	const { src, alt = "", ...rest } = props;

	if (!src) return null;

	return (
		<button
			className="block w-full cursor-pointer"
			onClick={() => openLightbox({ src: src as string, alt })}
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
