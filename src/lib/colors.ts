export const CLIENT_COLOR_MAP = {
  "dark-green": "#83C9A9",
  "dark-red": "#F06A6A",
  "light-purple": "#CD95EA",
  "dark-purple": "#9E97E7",
  "dark-brown": "#F8DF72",
  "dark-orange": "#EC8D71",
  "light-blue": "#4573D2",
  "dark-teal": "#9EE7E3",
  "light-teal": "#4ECBC4",
  "light-red": "#FC979A",
  "dark-pink": "#F26FB2",
  "light-pink": "#F9AAEF",
  "light-warm-gray": "#6D6E6F",
  none: "#C7C4C4",
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
