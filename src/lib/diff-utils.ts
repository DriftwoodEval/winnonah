import type { JSONContent } from "@tiptap/core";
import { type Change, diffWords } from "diff";

export const extractTextFromTipTap = (node: JSONContent | null | undefined): string => {
  if (!node) return "";
  if (node.type === "text") return node.text || "";

  const separator = node.type && ["paragraph", "heading"].includes(node.type) ? "\n" : "";

  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextFromTipTap).join("") + separator;
  }

  return "";
};

export const calculateDiff = (oldText: string, newText: string): Change[] => {
  return diffWords(oldText, newText);
};
