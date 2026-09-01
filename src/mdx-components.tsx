import type { MDXComponents } from "mdx/types";
import { Callout } from "~/app/docs/_components/Callout";
import { DocsImage } from "~/app/docs/_components/DocsImage";

const components: MDXComponents = {
	img: DocsImage,
	Callout,
};

export function useMDXComponents(): MDXComponents {
	return components;
}
