import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@ui/accordion";
import type { MDXComponents } from "mdx/types";
import { Callout, CalloutTitle } from "~/app/docs/_components/Callout";
import { DocsImage } from "~/app/docs/_components/DocsImage";

const components: MDXComponents = {
	img: DocsImage,
	Callout,
	CalloutTitle,
	Accordion,
	AccordionItem,
	AccordionTrigger,
	AccordionContent,
};

export function useMDXComponents(): MDXComponents {
	return components;
}
