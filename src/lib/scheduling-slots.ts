// Open-slot math for the Scheduling Helper. All ranges are epoch milliseconds.
export type TimeRange = { start: number; end: number };

// The parts of `windows` not covered by any `busy` range, in time order.
export function freeIntervals(
	windows: TimeRange[],
	busy: TimeRange[],
): TimeRange[] {
	const sortedBusy = busy.toSorted((a, b) => a.start - b.start);
	const free: TimeRange[] = [];
	for (const window of windows.toSorted((a, b) => a.start - b.start)) {
		let cursor = window.start;
		for (const b of sortedBusy) {
			if (b.end <= cursor || b.start >= window.end) continue;
			if (b.start > cursor) free.push({ start: cursor, end: b.start });
			cursor = Math.max(cursor, b.end);
		}
		if (cursor < window.end) free.push({ start: cursor, end: window.end });
	}
	return free;
}

// How many back-to-back appointments of `durationMs` still fit in the free time.
export function countOpenSlots(free: TimeRange[], durationMs: number): number {
	return free.reduce(
		(total, range) =>
			total + Math.floor((range.end - range.start) / durationMs),
		0,
	);
}

// Candidate start times: every `stepMs` from the start of each free interval,
// as long as the appointment still fits and starts at or after `notBefore`.
export function slotStarts(
	free: TimeRange[],
	durationMs: number,
	stepMs: number,
	notBefore = 0,
): number[] {
	const starts: number[] = [];
	for (const range of free) {
		for (
			let start = range.start;
			start + durationMs <= range.end;
			start += stepMs
		) {
			if (start >= notBefore) starts.push(start);
		}
	}
	return starts.toSorted((a, b) => a - b);
}
