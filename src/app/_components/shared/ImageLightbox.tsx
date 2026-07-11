"use client";

import { Dialog, DialogContent } from "@ui/dialog";
import { createContext, useCallback, useContext, useState } from "react";

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

	const openLightbox = useCallback((next: LightboxImage) => {
		setImage(next);
	}, []);

	return (
		<LightboxContext.Provider value={{ openLightbox }}>
			{children}
			<Dialog onOpenChange={(open) => !open && setImage(null)} open={!!image}>
				<DialogContent className="w-fit max-w-[calc(100%-2rem)] border-none bg-transparent p-0 shadow-none sm:max-w-[calc(100%-2rem)]">
					{image && (
						// biome-ignore lint/performance/noImgElement: full-size preview of an arbitrary local image, not eligible for next/image optimization
						<img
							alt={image.alt}
							className="max-h-[85vh] max-w-[calc(100vw-2rem)] rounded-lg object-contain"
							src={image.src}
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
