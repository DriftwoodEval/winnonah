type BillingCode = { code: string; units: number };
type BillingAppointment = { codes: BillingCode[] };

export function calculateAdditionalAppointments(
	totalMinutes: number,
	maxUnitsPerDay: number,
): BillingAppointment[] {
	if (totalMinutes <= 0) return [];

	const adjusted = totalMinutes * 1.5;

	// 96130/96131: 60-min codes (review/report work)
	const total96130_131 = Math.ceil(adjusted / 2 / 60);

	// 96136/96137: 30-min codes (evaluation/testing)
	const total96136_137 = Math.floor((adjusted - total96130_131 * 60) / 30);

	const appointments: BillingAppointment[] = [];

	// Fill 96136/96137 first (30-min codes)
	let remaining136_137 = total96136_137;
	let first136Used = false;
	while (remaining136_137 > 0) {
		const take = Math.min(remaining136_137, maxUnitsPerDay);
		const codes: BillingCode[] = [];
		if (!first136Used) {
			codes.push({ code: "96136", units: 1 });
			if (take > 1) codes.push({ code: "96137", units: take - 1 });
			first136Used = true;
		} else {
			codes.push({ code: "96137", units: take });
		}
		appointments.push({ codes });
		remaining136_137 -= take;
	}

	// Then fill 96130/96131 (60-min codes)
	let remaining130_131 = total96130_131;
	let first130Used = false;
	while (remaining130_131 > 0) {
		const take = Math.min(remaining130_131, maxUnitsPerDay);
		const codes: BillingCode[] = [];
		if (!first130Used) {
			codes.push({ code: "96130", units: 1 });
			if (take > 1) codes.push({ code: "96131", units: take - 1 });
			first130Used = true;
		} else {
			codes.push({ code: "96131", units: take });
		}
		appointments.push({ codes });
		remaining130_131 -= take;
	}

	return appointments;
}
