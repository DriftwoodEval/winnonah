"use client";

import { useCallback, useRef } from "react";

const STORAGE_PREFIX = "persisted-scroll:";

/**
 * Persists the vertical scroll position of a scrollable element to
 * sessionStorage and restores it when the element is mounted again.
 *
 * Returns a ref callback: pass it to the scrollable element (for a Radix
 * ScrollArea, that is the `viewportRef` prop). Restoration keeps re-applying
 * the saved offset while the content grows (lazy data, images) and stops once
 * the target is reached or the user scrolls manually.
 */
export function usePersistedScroll(key: string) {
	const cleanupRef = useRef<(() => void) | null>(null);

	return useCallback(
		(element: HTMLElement | null) => {
			cleanupRef.current?.();
			cleanupRef.current = null;

			if (!element || !key) return;

			const storageKey = STORAGE_PREFIX + key;

			const readSaved = () => {
				const raw = sessionStorage.getItem(storageKey);
				if (raw === null) return null;
				const value = Number.parseInt(raw, 10);
				return Number.isNaN(value) ? null : value;
			};

			const target = readSaved();
			let userScrolled = false;
			let restoring = target !== null;

			const applyTarget = () => {
				if (target === null || userScrolled) return;
				const max = element.scrollHeight - element.clientHeight;
				element.scrollTop = Math.min(target, max);
				if (element.scrollTop >= target - 1) {
					restoring = false;
					observer.disconnect();
				}
			};

			const handleScroll = () => {
				if (restoring) {
					// Ignore the programmatic scrolls from applyTarget.
					return;
				}
				userScrolled = true;
				sessionStorage.setItem(
					storageKey,
					Math.round(element.scrollTop).toString(),
				);
			};

			const observer = new ResizeObserver(() => {
				applyTarget();
			});
			observer.observe(element);
			for (const child of Array.from(element.children)) {
				observer.observe(child);
			}

			applyTarget();
			// Give layout a moment to settle, then allow saves.
			const settleTimeout = window.setTimeout(() => {
				applyTarget();
				restoring = false;
				observer.disconnect();
			}, 1000);

			element.addEventListener("scroll", handleScroll, { passive: true });

			cleanupRef.current = () => {
				window.clearTimeout(settleTimeout);
				observer.disconnect();
				element.removeEventListener("scroll", handleScroll);
			};
		},
		[key],
	);
}
