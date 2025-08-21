export const CLIENT_COLOR_MAP = {
  none: "#c5c5c5", // Gray
  red: "#ff878a", // Red
  orange: "#fea06a", // Orange
  "yellow-orange": "#f7bd51", // Drop This
  yellow: "#f6d861", // Yellow
  "yellow-green": "#c3e684", // Drop This
  green: "#85d7a2", // Green
  "blue-green": "#77d3e9", // Teal
  aqua: "#a1e7dd", // Drop This
  blue: "#79abff", // Blue
  indigo: "#b8acff", // Drop This
  purple: "#e39ef2", // Purple
  magenta: "#faaee9", // Light Pink
  "hot-pink": "#ff95c9", // Hot Pink
  pink: "#ffafc1", // Drop This
  "cool-gray": "#aaa", // Drop This
};

export const formatColorName = (name: string) =>
  name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export type ClientColor = keyof typeof CLIENT_COLOR_MAP;

export const CLIENT_COLOR_KEYS = Object.keys(CLIENT_COLOR_MAP) as [
  ClientColor,
  ...ClientColor[]
];

export function isClientColor(key: string): key is ClientColor {
  return key in CLIENT_COLOR_MAP;
}

export function getHexFromColor(key: ClientColor): string {
  return CLIENT_COLOR_MAP[key];
}
