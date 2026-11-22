import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "~/server/api/root";
import { FAKE_CLIENTS, isNotesOnlyClient } from "./clients";

type Policy =
	inferRouterOutputs<AppRouter>["clients"]["getInsurancePolicies"]["policies"][number];

/** Every nullable column of a policy row, so each fake policy only sets what it shows. */
const NULL_COLUMNS = {
	benefitsAuthDate: null,
	benefitsAuthNumber: null,
	benefitsCpt: null,
	benefitsSpokeTO: null,
	clientMemo: null,
	copayAmount: null,
	copayPercent: null,
	deductible: null,
	deductibleMet: null,
	employer: null,
	groupNumber: null,
	insuranceAddress1: null,
	insuranceAddress2: null,
	insuranceAddress3: null,
	insuranceCity: null,
	insuranceCompanyName: null,
	insuranceCountry: null,
	insuranceNumber: null,
	insurancePayerId: null,
	insurancePhone: null,
	insurancePrecertPhone: null,
	insuranceState: null,
	insuranceType: null,
	insuranceWebsite: null,
	insuranceZip: null,
	insuredAddress1: null,
	insuredAddress2: null,
	insuredAddress3: null,
	insuredCity: null,
	insuredCountry: null,
	insuredDob: null,
	insuredFirstName: null,
	insuredGender: null,
	insuredLastName: null,
	insuredMiddleName: null,
	insuredPhone: null,
	insuredRelation: null,
	insuredRelationOther: null,
	insuredState: null,
	insuredZip: null,
	isCopay: null,
	memo: null,
	paysAt: null,
	planName: null,
	policyAddedByName: null,
	policyAddedDate: null,
	policyCompanyName: null,
	policyCompanyPhone: null,
	policyEndDate: null,
	policyModifiedByName: null,
	policyModifiedDate: null,
	policyStartDate: null,
	policyType: null,
	precertAuthDate: null,
	precertAuthNumber: null,
	precertCpt: null,
	precertExpireDate: null,
	precertMemo: null,
	precertRequired: null,
	precertSpokeTO: null,
	precertStartDate: null,
	precertVisitAllowed: null,
	precertVisitUsed: null,
	privatePay: null,
	referName: null,
	referNpi: null,
	referRole: null,
	treatFrequency: null,
};
const policy = (
	clientId: number,
	i: number,
	over: Partial<Policy>,
): Policy => ({
	...NULL_COLUMNS,
	policyId: `policy-${clientId}-${i}`,
	clientId,
	policyType: "Primary",
	policyStartDate: "2026-01-01",
	policyEndDate: null,
	policyAddedDate: "2026-01-05",
	policyAddedByName: "Front Desk",
	policyModifiedDate: "2026-09-12",
	policyModifiedByName: "Front Desk",
	privatePay: false,
	planName: "PPO Choice",
	insuranceNumber: `XJ${clientId}00${i}`,
	groupNumber: "GRP-4471",
	employer: "Example Employer",
	policyCompanyName: null,
	policyCompanyPhone: null,
	memo: null,
	clientMemo: null,
	insuranceType: "Commercial",
	insuranceCompanyName: "Example Health",
	insurancePayerId: "12345",
	insurancePhone: "(555) 555-0100",
	insurancePrecertPhone: "(555) 555-0101",
	insuranceWebsite: "https://example.com",
	insuranceAddress1: "100 Main St",
	insuranceCity: "Columbia",
	insuranceState: "SC",
	insuranceZip: "29201",
	insuredFirstName: "Pat",
	insuredLastName: "Guardian",
	insuredDob: "1985-04-02",
	insuredRelation: "Parent",
	deductible: "1500",
	deductibleMet: "400",
	isCopay: true,
	copayAmount: "30",
	precertRequired: true,
	precertStartDate: "2026-02-01",
	precertExpireDate: "2027-02-01",
	precertVisitAllowed: "12",
	precertVisitUsed: "3",
	precertAuthNumber: "AUTH-88123",
	precertMemo: "Renew before expiry",
	...over,
});

/**
 * `clients.getInsurancePolicies`: variety by id, an active primary with an optional ended
 * secondary, private pay, no policies, and an organization mismatch.
 */
export const insurancePolicies = (clientId: unknown) => {
	const id = Number(clientId);
	const client = FAKE_CLIENTS.find((c) => c.id === id);
	if (!client || isNotesOnlyClient(client) || id % 7 === 0) {
		return {
			policies: [],
			organizationInsurance: null,
			organizationMismatch: false,
		};
	}
	const policies: Policy[] = [
		id % 5 === 0
			? policy(id, 0, {
					privatePay: true,
					insuranceType: "Self pay",
					planName: null,
					insuranceNumber: null,
					insuranceCompanyName: null,
				})
			: policy(id, 0, {}),
	];
	if (id % 3 === 0) {
		policies.push(
			policy(id, 1, {
				policyType: "Secondary",
				planName: "Medicaid",
				insuranceType: "Medicaid",
				policyStartDate: "2025-06-01",
				policyEndDate: "2026-05-31",
			}),
		);
	}
	return {
		policies,
		organizationInsurance: client.medicaidOrganization ? "Select Health" : null,
		organizationMismatch: id % 4 === 0 && !!client.medicaidOrganization,
	};
};
