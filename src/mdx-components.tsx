import type { MDXComponents } from "mdx/types";
import { DocsImage } from "~/app/docs/_components/DocsImage";

const components: MDXComponents = {
	img: DocsImage,
};

export function useMDXComponents(): MDXComponents {
	return components;
}
