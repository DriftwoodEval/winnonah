"use client";

import { useEffect } from "react";

// Replaces the root layout when it fails, so it cannot rely on the app's
// stylesheet or components. Inline styles keep it readable in light and dark.
export default function GlobalError({
	error,
	retry,
}: {
	error: Error & { digest?: string };
	retry: () => void;
}) {
	useEffect(() => {
		console.error(error);
	}, [error]);

	return (
		<html lang="en">
			<body
				style={{
					display: "flex",
					minHeight: "100vh",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					gap: "1rem",
					margin: 0,
					padding: "2rem",
					textAlign: "center",
					fontFamily: "system-ui, sans-serif",
					colorScheme: "light dark",
				}}
			>
				<h1 style={{ fontSize: "1.25rem", margin: 0 }}>Something went wrong</h1>
				<p style={{ maxWidth: "28rem", margin: 0, opacity: 0.7 }}>
					The app could not load. Trying again often fixes it.
				</p>
				{error.digest && (
					<p
						style={{ fontFamily: "monospace", fontSize: "0.75rem", margin: 0 }}
					>
						Reference: {error.digest}
					</p>
				)}
				<button
					onClick={retry}
					style={{ padding: "0.5rem 1rem" }}
					type="button"
				>
					Try again
				</button>
			</body>
		</html>
	);
}
