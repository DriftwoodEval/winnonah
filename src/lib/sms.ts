// GSM-7 basic character set. Characters outside this set force UCS-2 encoding.
const GSM_7_BASIC =
	"@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1BÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
// Characters in the GSM-7 extension table cost 2 characters (escape + char).
const GSM_7_EXTENDED = "^{}\\[~]|€";

export interface SmsSegmentInfo {
	length: number;
	encoding: "GSM-7" | "UCS-2";
	segments: number;
	charsPerSegment: number;
}

export function getSmsSegmentInfo(text: string): SmsSegmentInfo {
	const isGsm7 = [...text].every(
		(char) => GSM_7_BASIC.includes(char) || GSM_7_EXTENDED.includes(char),
	);

	const encoding = isGsm7 ? "GSM-7" : "UCS-2";
	const length = isGsm7
		? [...text].reduce(
				(sum, char) => sum + (GSM_7_EXTENDED.includes(char) ? 2 : 1),
				0,
			)
		: [...text].length;

	const singleSegmentLimit = isGsm7 ? 160 : 70;
	const multiSegmentLimit = isGsm7 ? 153 : 67;

	const segments =
		length === 0
			? 0
			: length <= singleSegmentLimit
				? 1
				: Math.ceil(length / multiSegmentLimit);

	const charsPerSegment =
		segments <= 1 ? singleSegmentLimit : multiSegmentLimit;

	return { length, encoding, segments, charsPerSegment };
}
