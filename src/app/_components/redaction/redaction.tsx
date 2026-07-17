"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

export type RedactionMode = "scramble" | "blur";

interface RedactionContextValue {
	enabled: boolean;
	toggle: () => void;
	mode: RedactionMode;
	setMode: (mode: RedactionMode) => void;
}

const RedactionContext = createContext<RedactionContextValue>({
	enabled: false,
	toggle: () => {},
	mode: "blur",
	setMode: () => {},
});

/**
 * Mounted for all users. Whether the toggle to enable redaction is shown
 * is gated by the "settings:pii-redaction" permission, see HeaderActions.
 */
export function RedactionProvider({ children }: { children: React.ReactNode }) {
	const [enabled, setEnabled] = useState(false);
	const [mode, setMode] = useState<RedactionMode>("blur");
	const pathname = usePathname();

	// Redaction is per-page only, never carries over on navigation.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally fires only when pathname changes, the effect body doesn't need to read it
	useEffect(() => {
		setEnabled(false);
	}, [pathname]);

	return (
		<RedactionContext.Provider
			value={{ enabled, toggle: () => setEnabled((e) => !e), mode, setMode }}
		>
			{children}
		</RedactionContext.Provider>
	);
}

export function useRedaction() {
	return useContext(RedactionContext);
}
