"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@ui/dialog";
import {
	createContext,
	type SyntheticEvent,
	useCallback,
	useContext,
	useState,
} from "react";

interface LightboxImage {
	src: string;
	alt: string;
}

interface LightboxContextValue {
	openLightbox: (image: LightboxImage) => void;
}

const LightboxContext = createContext<LightboxContextValue | null>(null);

export function ImageLightboxProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [image, setImage] = useState<LightboxImage | null>(null);
	const [ratio, setRatio] = useState<number | null>(null);

	const openLightbox = useCallback((next: LightboxImage) => {
		setImage(next);
		setRatio(null);
	}, []);

	const handleLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
		const { naturalWidth, naturalHeight } = event.currentTarget;
		setRatio(naturalWidth / naturalHeight);
	}, []);

	return (
		<LightboxContext.Provider value={{ openLightbox }}>
			{children}
			<Dialog onOpenChange={(open) => !open && setImage(null)} open={!!image}>
				<DialogContent
					className="flex h-screen w-screen max-w-none cursor-zoom-out items-center justify-center border-none bg-transparent p-4 shadow-none sm:max-w-none"
					onClick={() => setImage(null)}
					showCloseButton={false}
				>
					<DialogTitle className="sr-only">
						{image?.alt || "Image preview"}
					</DialogTitle>
					<DialogDescription className="sr-only">
						Full-size image preview
					</DialogDescription>
					{image && (
						// biome-ignore lint/performance/noImgElement: full-size preview of an arbitrary local image, not eligible for next/image optimization
						<img
							alt={image.alt}
							className="rounded-lg object-contain"
							onLoad={handleLoad}
							src={image.src}
							style={
								ratio
									? {
											width: `min(calc(100vw - 2rem), calc((100vh - 2rem) * ${ratio}))`,
											height: `min(calc(100vh - 2rem), calc((100vw - 2rem) / ${ratio}))`,
										}
									: { maxHeight: "100%", maxWidth: "100%" }
							}
						/>
					)}
				</DialogContent>
			</Dialog>
		</LightboxContext.Provider>
	);
}

export function useLightbox(): LightboxContextValue {
	const context = useContext(LightboxContext);
	if (!context) {
		throw new Error("useLightbox must be used within an ImageLightboxProvider");
	}
	return context;
}
