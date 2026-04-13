import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../src/server/db";
import { clients, offices } from "../src/server/db/schema";

/**
 * Haversine formula to calculate the distance between two points on Earth in miles.
 */
function calculateDistance(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
): number {
	const R = 3958.8; // Earth's radius in miles
	const dLat = (lat2 - lat1) * (Math.PI / 180);
	const dLon = (lon2 - lon1) * (Math.PI / 180);
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(lat1 * (Math.PI / 180)) *
			Math.cos(lat2 * (Math.PI / 180)) *
			Math.sin(dLon / 2) *
			Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

/**
 * Calculates the median of an array of numbers.
 */
function calculateMedian(arr: number[]): number {
	if (arr.length === 0) return 0;
	const sorted = [...arr].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 !== 0
		? sorted[mid]
		: (sorted[mid - 1] + sorted[mid]) / 2;
}

interface OfficeLocation {
	key: string;
	prettyName: string;
	lat: number;
	lon: number;
}

async function main() {
	const args = process.argv.slice(2);
	if (args.length < 3) {
		console.error(
			"Usage: npx tsx scripts/calculate-office-move-impact.ts <officeKey> <newLat> <newLon>",
		);
		console.log(
			"Example: npx tsx scripts/calculate-office-move-impact.ts CHS 32.7765 -79.9311",
		);
		process.exit(1);
	}

	const officeKeyArg = args[0];
	const newLatStr = args[1];
	const newLonStr = args[2];

	if (!officeKeyArg || !newLatStr || !newLonStr) {
		console.error("Missing required arguments.");
		process.exit(1);
	}

	const newLat = parseFloat(newLatStr);
	const newLon = parseFloat(newLonStr);

	if (Number.isNaN(newLat) || Number.isNaN(newLon)) {
		console.error("Invalid coordinates provided.");
		process.exit(1);
	}

	// 1. Get all offices
	const allOffices = await db.select().from(offices);
	const currentOffices: OfficeLocation[] = allOffices.map((o) => ({
		key: o.key,
		prettyName: o.prettyName,
		lat: parseFloat(o.latitude),
		lon: parseFloat(o.longitude),
	}));

	const officeToMove = currentOffices.find((o) => o.key === officeKeyArg);

	if (!officeToMove) {
		console.error(`Office with key "${officeKeyArg}" not found.`);
		console.log(
			"Available offices:",
			currentOffices.map((o) => o.key).join(", "),
		);
		process.exit(1);
	}

	console.log(
		`Analyzing impact of moving office "${officeToMove.prettyName}" (${officeToMove.key})`,
	);
	console.log(`From: ${officeToMove.lat}, ${officeToMove.lon}`);
	console.log(`To:   ${newLat}, ${newLon}`);
	console.log("--------------------------------------------------");

	// Prepare the "after" office locations
	const afterOffices: OfficeLocation[] = currentOffices.map((o) => {
		if (o.key === officeKeyArg) {
			return { ...o, lat: newLat, lon: newLon };
		}
		return o;
	});

	// 2. Get all active clients with coordinates
	const activeClients = await db
		.select()
		.from(clients)
		.where(
			and(
				eq(clients.status, true),
				isNotNull(clients.latitude),
				isNotNull(clients.longitude),
			),
		);

	console.log(`Found ${activeClients.length} active clients with coordinates.`);

	const impacts = activeClients
		.map((client) => {
			if (client.latitude === null || client.longitude === null) return null;

			const clientLat = parseFloat(client.latitude);
			const clientLon = parseFloat(client.longitude);

			// Calculate distance to closest office before the move
			let oldClosestDist = Infinity;
			let oldClosestOffice = "";
			for (const office of currentOffices) {
				const d = calculateDistance(
					clientLat,
					clientLon,
					office.lat,
					office.lon,
				);
				if (d < oldClosestDist) {
					oldClosestDist = d;
					oldClosestOffice = office.key;
				}
			}

			// Calculate distance to closest office after the move
			let newClosestDist = Infinity;
			let newClosestOffice = "";
			for (const office of afterOffices) {
				const d = calculateDistance(
					clientLat,
					clientLon,
					office.lat,
					office.lon,
				);
				if (d < newClosestDist) {
					newClosestDist = d;
					newClosestOffice = office.key;
				}
			}

			const delta = newClosestDist - oldClosestDist;

			return {
				name: client.fullName,
				address: client.address ?? "No address",
				oldClosestOffice,
				oldClosestDist,
				newClosestOffice,
				newClosestDist,
				delta,
				officeSwitched: oldClosestOffice !== newClosestOffice,
			};
		})
		.filter((i): i is NonNullable<typeof i> => i !== null);

	// 3. Calculate summary statistics
	const totalClients = impacts.length;
	const closer = impacts.filter((i) => i.delta < -0.01); // Small threshold for floating point
	const further = impacts.filter((i) => i.delta > 0.01);
	const same = impacts.filter((i) => Math.abs(i.delta) <= 0.01);
	const switched = impacts.filter((i) => i.officeSwitched);

	const avgOldDistance =
		impacts.reduce((sum, i) => sum + i.oldClosestDist, 0) / totalClients;
	const avgNewDistance =
		impacts.reduce((sum, i) => sum + i.newClosestDist, 0) / totalClients;
	const avgDelta = impacts.reduce((sum, i) => sum + i.delta, 0) / totalClients;

	const medianOldDistance = calculateMedian(
		impacts.map((i) => i.oldClosestDist),
	);
	const medianNewDistance = calculateMedian(
		impacts.map((i) => i.newClosestDist),
	);
	const medianDelta = calculateMedian(impacts.map((i) => i.delta));

	console.log("\nSummary of Impact (Closest Office Distance):");
	console.log(`- Average distance change: ${avgDelta.toFixed(2)} miles`);
	console.log(`- Median distance change:  ${medianDelta.toFixed(2)} miles`);
	console.log(
		`- Average travel distance: ${avgOldDistance.toFixed(2)} -> ${avgNewDistance.toFixed(2)} miles`,
	);
	console.log(
		`- Median travel distance:  ${medianOldDistance.toFixed(2)} -> ${medianNewDistance.toFixed(2)} miles`,
	);
	console.log(
		`- Clients closer: ${closer.length} (${((closer.length / totalClients) * 100).toFixed(1)}%)`,
	);
	console.log(
		`- Clients further: ${further.length} (${((further.length / totalClients) * 100).toFixed(1)}%)`,
	);
	console.log(
		`- Clients with no change: ${same.length} (${((same.length / totalClients) * 100).toFixed(1)}%)`,
	);
	console.log(
		`- Clients who switched closest office: ${switched.length} (${((switched.length / totalClients) * 100).toFixed(1)}%)`,
	);

	// 4. Show top 5 most negatively impacted and top 5 most positively impacted
	console.log("\nTop 5 Most Negatively Impacted (Further):");
	impacts
		.sort((a, b) => b.delta - a.delta)
		.slice(0, 5)
		.forEach((i) => {
			console.log(
				`  ${i.name.padEnd(25)}: +${i.delta.toFixed(2)} miles (${i.oldClosestOffice} -> ${i.newClosestOffice}, Total: ${i.newClosestDist.toFixed(2)})`,
			);
			console.log(`                             Address: ${i.address}`);
		});

	console.log("\nTop 5 Most Positively Impacted (Closer):");
	impacts
		.sort((a, b) => a.delta - b.delta)
		.slice(0, 5)
		.forEach((i) => {
			console.log(
				`  ${i.name.padEnd(25)}: ${i.delta.toFixed(2)} miles (${i.oldClosestOffice} -> ${i.newClosestOffice}, Total: ${i.newClosestDist.toFixed(2)})`,
			);
			console.log(`                             Address: ${i.address}`);
		});

	if (switched.length > 0) {
		console.log("\nSummary of Office Switches:");
		const switchData: Record<string, { count: number; deltas: number[] }> = {};
		for (const i of switched) {
			const key = `${i.oldClosestOffice} -> ${i.newClosestOffice}`;
			if (!switchData[key]) {
				switchData[key] = { count: 0, deltas: [] };
			}
			switchData[key].count++;
			switchData[key].deltas.push(i.delta);
		}

		for (const [switchPath, data] of Object.entries(switchData)) {
			const avgDelta = data.deltas.reduce((sum, d) => sum + d, 0) / data.count;
			const medianDelta = calculateMedian(data.deltas);
			const avgDirection = avgDelta > 0 ? "+" : "";
			const medianDirection = medianDelta > 0 ? "+" : "";
			console.log(`  ${switchPath}: ${data.count} client(s)`);
			console.log(
				`    Avg change:    ${avgDirection}${avgDelta.toFixed(2)} miles`,
			);
			console.log(
				`    Median change: ${medianDirection}${medianDelta.toFixed(2)} miles`,
			);
		}
	}
}

main()
	.catch(console.error)
	.finally(() => process.exit(0));
