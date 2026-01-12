export const SCHEDULING_COLOR_MAP = {
	"Sent one or more messages": "#b6dceb",
	"Ready to reach out": "#00b5ff",
	"Check insurance": "#ccb6eb",
};

export const formatColorName = (name: string) =>
	name
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");

export type SchedulingColor = keyof typeof SCHEDULING_COLOR_MAP;

export const SCHEDULING_COLOR_KEYS = Object.keys(SCHEDULING_COLOR_MAP) as [
	SchedulingColor,
	...SchedulingColor[],
];

export function isSchedulingColor(key: string): key is SchedulingColor {
	return key in SCHEDULING_COLOR_MAP;
}

export function getHexFromColor(key: SchedulingColor): string {
	return SCHEDULING_COLOR_MAP[key];
}
