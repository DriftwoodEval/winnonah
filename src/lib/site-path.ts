/**
 * Turns a user-supplied redirect target into a path on this site, or "/" when
 * it points anywhere else. Parsing it as a URL catches the forms a browser
 * treats as another site, such as `//host`, `/\host`, and ones with a tab or
 * newline in them.
 */
export function toSitePath(value: string | null | undefined): string {
	if (!value) return "/";
	const base = "http://site.invalid";
	try {
		const url = new URL(value, base);
		if (url.origin !== base) return "/";
		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return "/";
	}
}
