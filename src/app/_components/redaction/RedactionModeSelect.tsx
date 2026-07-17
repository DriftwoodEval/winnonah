"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { type RedactionMode, useRedaction } from "./redaction";

/** Control for how <Redact> redacts text: scrambled or blurred. */
export function RedactionModeSelect() {
	const { mode, setMode } = useRedaction();

	return (
		<Select onValueChange={(v) => setMode(v as RedactionMode)} value={mode}>
			<SelectTrigger className="h-7 w-24 border-dashed text-xs">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="scramble">Scramble</SelectItem>
				<SelectItem value="blur">Blur</SelectItem>
			</SelectContent>
		</Select>
	);
}
