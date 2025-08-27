export const CLIENT_COLOR_MAP = {
  gray: "#c5c5c5",
  red: "#ff878a",
  orange: "#fea06a",
  yellow: "#f6d861",
  green: "#85d7a2",
  teal: "#77d3e9",
  blue: "#79abff",
  purple: "#e39ef2",
  "light-pink": "#faaee9",
  "hot-pink": "#ff95c9",
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
