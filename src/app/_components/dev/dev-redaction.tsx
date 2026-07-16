"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

export type DevRedactionMode = "scramble" | "blur";

interface DevRedactionContextValue {
	enabled: boolean;
	toggle: () => void;
	mode: DevRedactionMode;
	setMode: (mode: DevRedactionMode) => void;
}

const DevRedactionContext = createContext<DevRedactionContextValue>({
	enabled: false,
	toggle: () => {},
	mode: "blur",
	setMode: () => {},
});

/**
 * Dev-only. Not mounted in production, so useDevRedaction() there always
 * falls back to the disabled default above and <DevRedact> is a no-op.
 */
export function DevRedactionProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [enabled, setEnabled] = useState(false);
	const [mode, setMode] = useState<DevRedactionMode>("blur");
	const pathname = usePathname();

	// Redaction is per-page only, never carries over on navigation.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally fires only when pathname changes, the effect body doesn't need to read it
	useEffect(() => {
		setEnabled(false);
	}, [pathname]);

	return (
		<DevRedactionContext.Provider
			value={{ enabled, toggle: () => setEnabled((e) => !e), mode, setMode }}
		>
			{children}
		</DevRedactionContext.Provider>
	);
}

export function useDevRedaction() {
	return useContext(DevRedactionContext);
}
