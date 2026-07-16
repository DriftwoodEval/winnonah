const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = LOWER.toUpperCase();
const DIGITS = "0123456789";

/**
 * Replaces letters and digits with random characters of the same case/type,
 * leaving whitespace and punctuation in place so layout stays realistic for
 * dev-mode screenshots.
 */
export function scrambleText(text: string): string {
	return text.replace(/[A-Za-z0-9]/g, (char) => {
		if (LOWER.includes(char))
			return LOWER[Math.floor(Math.random() * 26)] ?? char;
		if (UPPER.includes(char))
			return UPPER[Math.floor(Math.random() * 26)] ?? char;
		return DIGITS[Math.floor(Math.random() * 10)] ?? char;
	});
}
