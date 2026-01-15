export default function VersionFooter() {
	const isDev = process.env.NODE_ENV === "development";
	const branch = process.env.NEXT_PUBLIC_GIT_BRANCH;
	const hash = process.env.NEXT_PUBLIC_COMMIT_HASH;
	const buildDate = process.env.NEXT_PUBLIC_BUILD_DATE;

	return (
		<div className="fixed right-2 bottom-2 font-mono text-[10px] text-muted-foreground opacity-50 transition-opacity hover:opacity-100">
			{isDev ? (
				<span>Branch: {branch}</span>
			) : (
				<span>
					{hash} •{" "}
					{buildDate ? new Date(buildDate).toLocaleDateString() : "n/a"}
				</span>
			)}
		</div>
	);
}
