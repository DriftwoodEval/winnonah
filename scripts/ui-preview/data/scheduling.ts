import { FAKE_CLIENTS, isNotesOnlyClient } from "./clients";
import {
	evaluatorsAll,
	FAKE_DISTRICTS,
	FAKE_OFFICES,
	insurancesAll,
} from "./practice";

const NOW = new Date("2026-11-21T15:00:00.000Z").getTime();
const DAY = 86_400_000;

const evaluators = evaluatorsAll();
const offices = FAKE_OFFICES.filter((o) => !o.archived);
const CODES = ["DA", "EVAL", "DAEVAL", null];
const TIMES = ["9:00 AM", "11:00 AM", "1:30 PM", null];

const candidates = FAKE_CLIENTS.filter(
	(c) => c.status && !isNotesOnlyClient(c),
).slice(0, 36);

/** Scheduling rows for the first 36 active clients, the last 8 archived. Axes cycle so every value shows. */
const rows = candidates.map((c, i) => ({
	clientId: c.id,
	evaluator:
		i % 5 === 4 ? null : (evaluators[i % evaluators.length]?.npi ?? null),
	archived: i >= 28,
	date:
		i % 6 === 5
			? null
			: new Date(NOW + (i % 20) * DAY).toISOString().slice(0, 10),
	time: TIMES[i % TIMES.length] ?? null,
	office: i % 3 === 0 ? null : (offices[i % offices.length]?.key ?? null),
	notes: i % 4 === 0 ? "Parent prefers mornings" : null,
	code: CODES[i % CODES.length] ?? null,
	color: c.color,
	sort: i,
	createdAt: new Date(NOW - i * DAY),
	client: {
		hash: c.hash,
		fullName: c.fullName,
		asdAdhd: c.asdAdhd,
		primaryInsurance: c.primaryInsurance,
		secondaryInsurance: c.secondaryInsurance,
		schoolDistrict: c.schoolDistrict,
		precertExpires: c.precertExpires,
		dob: c.dob,
		referralData: null,
		closestOfficeKey: offices[0]?.key ?? "",
	},
}));

const withOffice = (r: (typeof rows)[number]) => ({
	...r,
	office: r.office ?? r.client.closestOfficeKey,
});

export const NONE = "__none__";

const payload = (archived: boolean) => ({
	clients: rows.filter((r) => r.archived === archived).map(withOffice),
	evaluators,
	offices: FAKE_OFFICES,
	schoolDistricts: FAKE_DISTRICTS,
	insurances: insurancesAll(),
});

export const schedulingGet = () => payload(false);
export const schedulingGetArchived = () => payload(true);

/**
 * Per-column option counts over the rows of one tab, shaped like `scheduling.facetCounts`.
 * lazy: ignores the active filters, so counts do not shrink as filters are applied.
 */
export function schedulingFacetCounts(raw: unknown) {
	const { archived } = (raw ?? {}) as { archived?: boolean };
	const tabRows = rows.filter((r) => r.archived === !!archived).map(withOffice);
	const insurances = insurancesAll();
	const tally = (values: (string | null | undefined)[]) => {
		const counts: Record<string, number> = {};
		for (const v of values) {
			const key = v || NONE;
			counts[key] = (counts[key] ?? 0) + 1;
		}
		return counts;
	};
	const evaluatorName = (npi: number | null) =>
		evaluators.find((e) => e.npi === npi)?.providerName.split(" ")[0];
	const officeName = (key: string | null) =>
		FAKE_OFFICES.find((o) => o.key === key)?.prettyName;
	const districtName = (full: string | null) => {
		const d = FAKE_DISTRICTS.find((x) => x.fullName === full);
		return d ? d.shortName || d.fullName : full;
	};
	const insuranceNames = tabRows.flatMap((r) => {
		const names = [
			r.client.primaryInsurance,
			...(r.client.secondaryInsurance ?? []),
		]
			.filter((n): n is string => !!n)
			.map(
				(n) =>
					insurances.find(
						(i) => i.shortName === n || i.aliases.some((a) => a.name === n),
					)?.shortName ?? n,
			);
		return names.length ? names : [null];
	});
	return {
		color: tally(tabRows.map((r) => r.color)),
		date: tally(tabRows.map((r) => r.date)),
		time: tally(tabRows.map((r) => r.time)),
		code: tally(tabRows.map((r) => r.code)),
		asdAdhd: tally(tabRows.map((r) => r.client.asdAdhd)),
		paDate: tally(tabRows.map((r) => r.client.precertExpires)),
		evaluator: tally(tabRows.map((r) => evaluatorName(r.evaluator))),
		location: tally(tabRows.map((r) => officeName(r.office))),
		district: tally(tabRows.map((r) => districtName(r.client.schoolDistrict))),
		insuranceNames: tally(insuranceNames),
	};
}
