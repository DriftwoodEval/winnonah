import { distance as levDistance } from "fastest-levenshtein";

// Split the user's input into words, dropping punctuation.
export function nameSearchWords(trimmedSearch: string) {
	return trimmedSearch
		.replace(/[^\w ]/g, " ")
		.split(" ")
		.filter(Boolean);
}

// True when every search word is within one edit of some name token, or is a
// substring of one. This is the typo tolerance of the client search everywhere.
export function fuzzyNameRowMatches(searchWords: string[], fullName: string) {
	const tokens = nameSearchWords(fullName.toLowerCase());
	return searchWords.every((raw) => {
		const word = raw.toLowerCase();
		return tokens.some((t) => t.includes(word) || levDistance(word, t) <= 1);
	});
}
