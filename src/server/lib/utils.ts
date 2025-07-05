import type { InferSelectModel } from "drizzle-orm";
import type { clients } from "~/server/db/schema";

export type Client = InferSelectModel<typeof clients>;

export interface SortedClient extends Client {
	sortReason?: string;
}

export const getBabyNetClientsAboveAge = (clients: SortedClient[]) => {
	// Get clients that are older than 2 years:6 months
	const minAge = new Date();
	minAge.setFullYear(minAge.getFullYear() - 2);
	minAge.setMonth(minAge.getMonth() - 6);

	const babynetClientsAboveAge = clients
		.filter((client) => {
			return client.dob && new Date(client.dob) < minAge;
		})
		.map((client) => ({
			...client,
			sortReason: "BabyNet above 2:6",
		}));

	babynetClientsAboveAge.sort(
		(a, b) => new Date(a.dob).getTime() - new Date(b.dob).getTime(),
	);

	return babynetClientsAboveAge;
};

export const sortRemainingClientsByAddedDate = (clients: SortedClient[]) => {
	const sorted = [...clients].map((client) => ({
		...client,
		sortReason: "Added date",
	}));

	sorted.sort(
		(a, b) =>
			new Date(a.addedDate ?? "").getTime() -
			new Date(b.addedDate ?? "").getTime(),
	);

	return sorted;
};

export const sortClients = (clients: SortedClient[]) => {
	const clientsWithBabyNet = clients.filter(
		(client) =>
			client.primaryInsurance === "BabyNet" ||
			client.secondaryInsurance === "BabyNet",
	);

	const clientsWithBabyNetAboveAge = getBabyNetClientsAboveAge(clientsWithBabyNet);

	const remainingClientsWithBabyNet = clientsWithBabyNet.filter(
		(client) =>
			!clientsWithBabyNetAboveAge.some((clientAboveAge) => clientAboveAge.id === client.id),
	);

	const remainingClients = clients.filter(
		(client) =>
			!clientsWithBabyNet.some((clientWithBabyNet) => clientWithBabyNet.id === client.id),
	);

	const sortedRemainingClients = sortRemainingClientsByAddedDate([
		...remainingClientsWithBabyNet,
		...remainingClients,
	]);

	return [...clientsWithBabyNetAboveAge, ...sortedRemainingClients];
};
