type BillingCode = { code: string; units: number };
type BillingAppointment = { codes: BillingCode[] };

type MaxUnitsPerCode = {
	max96130?: number;
	max96131?: number;
	max96136?: number;
	max96137?: number;
	// Max units allowed on the 4th appointment (output index 2, displayed as "Appointment 4")
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

	// The 4th appointment (displayed as "Appointment 4") is at output index 2
	const getApptUnitCap = (index: number): number =>
		index === 2 && maxUnitsPerCode?.maxAppt4Units !== undefined
			? maxUnitsPerCode.maxAppt4Units
			: maxUnitsPerDay;

	// Fill 96136/96137 (30-min codes)
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

	fill136_137(total96136_137);

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

	// Overflow 96131 units (capped by appointment 4 limit) convert to 96137 at 2:1
	if (remaining130_131 > 0) {
		fill136_137(remaining130_131 * 2);
	}

	return appointments;
}
