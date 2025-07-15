"use client";

import { useState } from "react";
import Editor, {
	BtnBold,
	BtnItalic,
	BtnStrikeThrough,
	BtnUnderline,
	Toolbar,
} from "react-simple-wysiwyg";
export function AsanaEditor({ initialHtml }: { initialHtml: string }) {
	const [html, setHtml] = useState(initialHtml);

	function onChange(e) {
		setHtml(e.target.value);
		console.log(html);
	}

	return (
		<Editor value={html} onChange={onChange} className="text-sm">
			<Toolbar>
				<BtnBold />
				<BtnItalic />
				<BtnUnderline />
				<BtnStrikeThrough />
			</Toolbar>
		</Editor>
	);
}
