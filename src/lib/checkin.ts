/**
 * An appointment with no office, or the virtual location key, happens over
 * video. Nobody arrives in person, so there is no check-in or check-out.
 */
export function isVirtualAppointment(locationKey: string | null | undefined) {
	return !locationKey || locationKey.toLowerCase() === "virtual";
}

/**
 * An evaluator can only be marked "in for the day" when they have at least one
 * in-person appointment that day. A fully virtual day has nothing to be in for.
 */
export function hasInPersonAppointment(
	appointments: { locationKey: string | null | undefined }[],
) {
	return appointments.some((appt) => !isVirtualAppointment(appt.locationKey));
}
