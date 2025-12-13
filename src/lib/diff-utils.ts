import { type Change, diffWords } from "diff";

// biome-ignore lint/suspicious/noExplicitAny: JSON
export const extractTextFromTipTap = (node: any): string => {
  if (!node) return "";
  if (node.type === "text") return node.text || "";

  const separator = ["paragraph", "heading"].includes(node.type) ? "\n" : "";

  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextFromTipTap).join("") + separator;
  }

  return "";
};

export const calculateDiff = (oldText: string, newText: string): Change[] => {
  return diffWords(oldText, newText);
};
