"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { type DevRedactionMode, useDevRedaction } from "./dev-redaction";

/** Dev-only control for how <DevRedact> redacts text: scrambled or blurred. */
export function DevRedactionModeSelect() {
	const { mode, setMode } = useDevRedaction();

	return (
		<Select onValueChange={(v) => setMode(v as DevRedactionMode)} value={mode}>
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
