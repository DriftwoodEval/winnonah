type BillingCode = { code: string; units: number };
type BillingAppointment = { codes: BillingCode[] };

export function parsePrecertMemo(memo: string): BillingCode[] | null {
	const text = memo.trim();
	const codeMap = new Map<string, number>();

	function addCode(code: string, units: number): void {
		codeMap.set(code, (codeMap.get(code) ?? 0) + units);
	}

	function runPattern(pattern: RegExp, codeIdx: 1 | 2, unitsIdx: 1 | 2): void {
		let m = pattern.exec(text);
		while (m !== null) {
			addCode(m[codeIdx]!, Number(m[unitsIdx]!));
			m = pattern.exec(text);
		}
	}

	// "CPT-N": "96136-1"
	runPattern(/(9613[0-1267])\s*-\s*(\d+)/g, 1, 2);
	// "CPT x N": "96136 x 1" or "96137 x  6"
	runPattern(/(9613[0-1267])\s+x\s+(\d+)/gi, 1, 2);
	// "CPT (N)": "96136 (1)"
	runPattern(/(9613[0-1267])\s*\((\d+)\)/g, 1, 2);
	// "N Unit(s) CPT": "1 Unit 96130" or "2 Units 96131"
	runPattern(/(\d+)\s+[Uu]nits?\s+(9613[0-1267])/g, 2, 1);

	if (codeMap.size === 0) return null;
	return Array.from(codeMap, ([code, units]) => ({ code, units })).sort(
		(a, b) => a.code.localeCompare(b.code),
	);
}

export function packCodesIntoAppointments(
	codes: BillingCode[],
	maxUnitsPerDay: number,
	maxAppt4Units?: number,
): BillingAppointment[] {
	const get = (code: string) => codes.find((c) => c.code === code)?.units ?? 0;

	const total96136 = get("96136");
	const total96137 = get("96137");
	const total96130 = get("96130");
	const total96131 = get("96131");

	const appointments: BillingAppointment[] = [];

	const getUnitCap = (idx: number): number =>
		idx === 3 && maxAppt4Units !== undefined ? maxAppt4Units : maxUnitsPerDay;

	// Pack 96136/96137 (30-min codes): one 96136 per appointment, fill rest with 96137
	let billed96136 = 0;
	let billed96137 = 0;
	let remaining = total96136 + total96137;
	while (remaining > 0) {
		const unitCap = getUnitCap(appointments.length);
		const apptCodes: BillingCode[] = [];
		let taken = 0;
		if (billed96136 < total96136) {
			apptCodes.push({ code: "96136", units: 1 });
			billed96136++;
			remaining--;
			taken++;
		}
		if (apptCodes.length > 0 && billed96137 < total96137 && taken < unitCap) {
			const take = Math.min(
				remaining,
				unitCap - taken,
				total96137 - billed96137,
			);
			if (take > 0) {
				apptCodes.push({ code: "96137", units: take });
				billed96137 += take;
				remaining -= take;
			}
		}
		if (apptCodes.length === 0) break;
		appointments.push({ codes: apptCodes });
	}

	// Pack 96130/96131 (60-min codes): 96130 once, fill rest with 96131
	let billed96130 = 0;
	let billed96131 = 0;
	remaining = total96130 + total96131;
	while (remaining > 0) {
		const unitCap = getUnitCap(appointments.length);
		const apptCodes: BillingCode[] = [];
		let taken = 0;
		if (billed96130 === 0 && total96130 > 0) {
			apptCodes.push({ code: "96130", units: 1 });
			billed96130++;
			remaining--;
			taken++;
		}
		if (billed96131 < total96131 && taken < unitCap) {
			const take = Math.min(
				remaining,
				unitCap - taken,
				total96131 - billed96131,
			);
			if (take > 0) {
				apptCodes.push({ code: "96131", units: take });
				billed96131 += take;
				remaining -= take;
			}
		}
		if (apptCodes.length === 0) break;
		appointments.push({ codes: apptCodes });
	}

	return appointments;
}

export type AssessmentSnapshot = {
	minutes: number;
	computedAt: string;
	ageInYears: number;
	asdAdhd: string | null;
	includedTypes: string[];
	excludedExternal: string[];
};

export function aggregateBillingCodes(
	appointments: BillingAppointment[],
): BillingCode[] {
	const codeMap = new Map<string, number>();
	for (const appt of appointments) {
		for (const c of appt.codes) {
			codeMap.set(c.code, (codeMap.get(c.code) ?? 0) + c.units);
		}
	}
	return Array.from(codeMap, ([code, units]) => ({ code, units }));
}

type MaxUnitsPerCode = {
	max96130?: number;
	max96131?: number;
	max96136?: number;
	max96137?: number;
	maxAppt4Units?: number;
};

export function calculateAdditionalAppointments(
	totalMinutes: number,
	maxUnitsPerDay: number,
	maxUnitsPerCode?: MaxUnitsPerCode,
): BillingAppointment[] {
	if (totalMinutes <= 0) return [];

	const adjusted = totalMinutes * 1.5;

	// 96130/96131: 60-min codes (review/report work)
	const total96130_131 = Math.ceil(adjusted / 2 / 60);

	// 96136/96137: 30-min codes (evaluation/testing)
	const total96136_137 = Math.floor((adjusted - total96130_131 * 60) / 30);

	const appointments: BillingAppointment[] = [];

	const cap96136 = maxUnitsPerCode?.max96136 ?? Infinity;
	const cap96137 = maxUnitsPerCode?.max96137 ?? Infinity;
	const cap96130 = maxUnitsPerCode?.max96130 ?? Infinity;
	const cap96131 = maxUnitsPerCode?.max96131 ?? Infinity;

	// Pre-calculate overflow: 96130/131 units that exceed code caps convert to 96136/137 at 2:1,
	// combined with the existing 96136/137 units so they share appointments.
	const actual96130 = total96130_131 > 0 && cap96130 > 0 ? 1 : 0;
	const actual96131 =
		cap96131 === Infinity
			? total96130_131 - actual96130
			: Math.min(total96130_131 - actual96130, cap96131);
	const overflow130_131 = total96130_131 - actual96130 - actual96131;
	const total96136_137_adjusted = total96136_137 + overflow130_131 * 2;

	const getApptUnitCap = (index: number): number =>
		index === 3 && maxUnitsPerCode?.maxAppt4Units !== undefined
			? maxUnitsPerCode.maxAppt4Units
			: maxUnitsPerDay;

	// Fill 96136/96137 (30-min codes), including converted overflow from 96130/131
	let billed96136 = 0;
	let billed96137 = 0;

	function fill136_137(remaining: number): number {
		while (remaining > 0) {
			const unitCap = getApptUnitCap(appointments.length);
			const codes: BillingCode[] = [];
			let taken = 0;
			if (billed96136 < cap96136) {
				codes.push({ code: "96136", units: 1 });
				billed96136++;
				remaining--;
				taken++;
			}
			// 96137 requires a 96136 on the same appointment
			if (codes.length > 0 && billed96137 < cap96137 && taken < unitCap) {
				const take = Math.min(
					remaining,
					unitCap - taken,
					cap96137 - billed96137,
				);
				if (take > 0) {
					codes.push({ code: "96137", units: take });
					billed96137 += take;
					remaining -= take;
				}
			}
			if (codes.length === 0) break;
			appointments.push({ codes });
		}
		return remaining;
	}

	fill136_137(total96136_137_adjusted);

	// Fill 96130/96131 (60-min codes)
	let remaining130_131 = total96130_131;
	let billed96130 = 0;
	let billed96131 = 0;
	while (remaining130_131 > 0) {
		const unitCap = getApptUnitCap(appointments.length);
		const codes: BillingCode[] = [];
		let taken = 0;
		if (billed96130 === 0 && billed96130 < cap96130) {
			codes.push({ code: "96130", units: 1 });
			billed96130++;
			remaining130_131--;
			taken++;
		}
		if (billed96131 < cap96131 && taken < unitCap) {
			const take = Math.min(
				remaining130_131,
				unitCap - taken,
				cap96131 - billed96131,
			);
			if (take > 0) {
				codes.push({ code: "96131", units: take });
				billed96131 += take;
				remaining130_131 -= take;
			}
		}
		if (codes.length === 0) break;
		appointments.push({ codes });
	}

	return appointments;
}
