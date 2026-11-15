/** Link to the PDF the daily Drive check found ("Missing" if it looked and
 * found none, a dash if it has not looked yet). */
export function PdfStatus({
	pdfFileId,
	pdfCheckedAt,
}: {
	pdfFileId: string | null;
	pdfCheckedAt: Date | null;
}) {
	if (pdfFileId) {
		return (
			<a
				className="text-primary hover:underline"
				href={`https://drive.google.com/file/d/${pdfFileId}/view`}
				rel="noreferrer"
				target="_blank"
			>
				View
			</a>
		);
	}
	if (pdfCheckedAt) return <span className="text-warning">Missing</span>;
	return <span className="text-muted-foreground">—</span>;
}
