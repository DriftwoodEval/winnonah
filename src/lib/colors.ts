export const CLIENT_COLOR_MAP = {
  none: "#c5c5c5",
  red: "#ff878a",
  orange: "#fea06a",
  "yellow-orange": "#f7bd51",
  yellow: "#f6d861",
  "yellow-green": "#c3e684",
  green: "#85d7a2",
  "blue-green": "#77d3e9",
  aqua: "#a1e7dd",
  blue: "#79abff",
  indigo: "#b8acff",
  purple: "#e39ef2",
  magenta: "#faaee9",
  "hot-pink": "#ff95c9",
  pink: "#ffafc1",
  "cool-gray": "#aaa",
};

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
