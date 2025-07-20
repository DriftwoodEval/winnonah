import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatClientAge(dob: Date, format = "long") {
  const ageInMilliseconds = Date.now() - dob.getTime();
  const years = Math.floor(ageInMilliseconds / (1000 * 60 * 60 * 24 * 365.25));
  const months = Math.floor(
    (ageInMilliseconds % (1000 * 60 * 60 * 24 * 365.25)) /
      (1000 * 60 * 60 * 24 * 30.44)
  );
  if (format === "short") {
    return `${years}:${months}`;
  }
  if (format === "years") {
    return `${years}`;
  }
  return years >= 3 ? `${years} years` : `${years} years, ${months} months`;
}

export const asanaColorMap = {
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

export function isColorKey(key: string): key is keyof typeof asanaColorMap {
  return key in asanaColorMap;
}

export function getColorFromMap(key: string): string {
  return asanaColorMap[key as keyof typeof asanaColorMap];
}
