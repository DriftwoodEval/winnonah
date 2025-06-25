"use server";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { env } from "~/env";
import { formatClientAge } from "~/lib/utils";
import { auth } from "~/server/auth";
import type { Client } from "~/server/lib/utils";

export const getRecommendedQuestionnaires = async (
	client: Client,
	asanaText: string,
) => {
	async function getDaevalInsurance() {
		const {
			AUTH_GOOGLE_ID,
			AUTH_GOOGLE_SECRET,
			PROVIDER_CREDENTIALING_ID,
			PROVIDER_CREDENTIALING_RANGE,
		} = env;
		const session = await auth();
		const { accessToken, refreshToken } = session?.user ?? {};

		const oauth2Client = new OAuth2Client({
			clientId: AUTH_GOOGLE_ID,
			clientSecret: AUTH_GOOGLE_SECRET,
		});
		oauth2Client.setCredentials({
			access_token: accessToken,
			refresh_token: refreshToken,
		});

		const sheetsApi = google.sheets({ version: "v4", auth: oauth2Client });
		const response = await sheetsApi.spreadsheets.values.get({
			spreadsheetId: PROVIDER_CREDENTIALING_ID,
			range: PROVIDER_CREDENTIALING_RANGE,
		});

		const data = response.data.values ?? [];
		const daevalInsurance: { [key: string]: number } = { PrivatePay: 1 };

		const startIndex = data.findIndex((row) => row?.[0] === "Insurance");

		for (const row of data.slice(startIndex + 1)) {
			const [rowHeader, daEvalPart] = row;

			if (rowHeader === "District Info" || rowHeader === "Offices") {
				break;
			}

			if (rowHeader && daEvalPart) {
				const key = rowHeader.replace(/[\/-]/g, "_").replace(/\s+/g, "");
				daevalInsurance[
					key.toLowerCase().startsWith("united_optum") ? "United_Optum" : key
				] = daEvalPart.trim();
			}
		}
		return daevalInsurance;
	}

	const vinelandCheck = (asanaText: string) => {
		const mhsLink = asanaText.includes("://s.mhs.com");
		const qglobalLink = asanaText.includes("://qosa.pearsonassessments.com");
		let sendVineland = false;
		let sendQuestionnaires = true;
		if (mhsLink && !qglobalLink) {
			sendVineland = true;
		} else if (mhsLink && qglobalLink) {
			sendQuestionnaires = false;
		}

		return {
			sendVineland,
			sendQuestionnaires,
		};
	};

	const daevalInsurance: { [key: string]: number } = await getDaevalInsurance();

	const clientsInsurance = [
		client.primaryInsurance,
		...(client.privatePay ? ["PrivatePay"] : []),
		...(client.secondaryInsurance?.split(",") ?? []),
	];

	const daevalValues = clientsInsurance.map(
		(insurance) => (insurance && daevalInsurance[insurance]) || 0,
	);

	const daevalNeeded = daevalValues.includes(2) ? 2 : Math.max(...daevalValues);

	let daeval: "EVAL" | "DAEVAL" | "DA" = "EVAL";
	// TODO: temporary logic
	if (daevalNeeded === 1) {
		daeval = "DAEVAL";
	} else if (daevalNeeded === 2) {
		daeval = "DA";
	}

	const { sendVineland, sendQuestionnaires } = vinelandCheck(asanaText);

	if (!sendQuestionnaires) {
		return ["Done"];
	}

	const age = Number(formatClientAge(client.dob, "years"));

	const QUESTIONNAIRES = {
		EVAL: {
			tooYoungAge: 2,
			ageRanges: [
				{
					age: 6, // age < 6
					standard: ["DP-4", "BASC Preschool", "Conners EC"],
					vineland: "Vineland",
					noVineland: "ASRS (2-5 Years)",
				},
				{
					age: 12, // age < 12
					standard: ["BASC Child", "Conners 4"],
					vineland: "Vineland",
					noVineland: "ASRS (6-18 Years)",
				},
				{
					age: 18, // age < 18
					standard: ["BASC Adolescent", "Conners 4 Self", "Conners 4"],
					vineland: "Vineland",
					noVineland: "ASRS (6-18 Years)",
				},
				{
					age: 19, // age < 19
					standard: ["ABAS 3", "BASC Adolescent", "PAI", "CAARS 2"],
					vineland: "Vineland",
					noVineland: "ASRS (6-18 Years)",
				},
				{
					age: 22, // age < 22
					standard: ["ABAS 3", "BASC Adolescent", "SRS-2", "CAARS 2", "PAI"],
				},
			],
			default: ["ABAS 3", "SRS-2", "CAARS 2", "PAI"], // age >= 22
		},
		DA: {
			ASD: {
				tooYoungAge: 2,
				ageRanges: [
					{
						age: 6, // age < 6
						standard: ["ASRS (2-5 Years)"],
					},
					{
						age: 19, // age < 19
						standard: ["ASRS (6-18 Years)"],
					},
				],
				default: ["SRS Self"], // age >= 19
			},
			ADHD: {
				tooYoungAge: 4,
				ageRanges: [
					{
						age: 6, // age < 6
						standard: ["Conners EC"],
					},
					{
						age: 12, // age < 12
						standard: ["Conners 4"],
					},
					{
						age: 18, // age < 18
						standard: ["Conners 4", "Conners 4 Self"],
					},
				],
				default: ["CAARS 2"], // age >= 18
			},
		},
		DAEVAL: {
			tooYoungAge: 2,
			ageRanges: [
				{
					age: 6, // age < 6
					standard: [
						"ASRS (2-5 Years)",
						"Vineland",
						"DP-4",
						"BASC Preschool",
						"Conners EC",
					],
				},
				{
					age: 12, // age < 12
					standard: [
						"ASRS (6-18 Years)",
						"Vineland",
						"BASC Child",
						"Conners 4",
					],
				},
				{
					age: 18, // age < 18
					standard: [
						"ASRS (6-18 Years)",
						"Vineland",
						"BASC Adolescent",
						"Conners 4 Self",
						"Conners 4",
					],
				},
				{
					age: 19, // age < 19
					standard: [
						"ASRS (6-18 Years)",
						"Vineland",
						"ABAS 3",
						"BASC Adolescent",
						"PAI",
						"CAARS 2",
					],
				},
				{
					age: 22, // age < 22
					standard: [
						"SRS Self",
						"ABAS 3",
						"BASC Adolescent",
						"SRS-2",
						"CAARS 2",
						"PAI",
					],
				},
			],
			default: ["SRS Self", "ABAS 3", "SRS-2", "CAARS 2", "PAI"], // age >= 22
		},
	};

	const type = client.asdAdhd === "Both" ? "ASD" : client.asdAdhd;

	if (type === null) {
		return ["Unknown: Missing ASD/ADHD"];
	}

	if (daeval === "DA") {
		const config = QUESTIONNAIRES.DA[type];
		if (age < config.tooYoungAge) {
			return ["Too young"];
		}
		for (const range of config.ageRanges) {
			if (age < range.age) {
				return range.standard;
			}
		}
		return config.default;
	}

	const config = QUESTIONNAIRES[daeval];
	if (age < config.tooYoungAge) {
		return ["Too young"];
	}

	for (const range of config.ageRanges) {
		if (age < range.age) {
			const questionnaires = [...range.standard];
			if (daeval === "EVAL" && "vineland" in range) {
				if (sendVineland && range.vineland) {
					questionnaires.push(range.vineland);
				} else if (range.noVineland) {
					questionnaires.push(range.noVineland);
				}
			}
			return questionnaires;
		}
	}

	return config.default || ["Unknown"];
};
