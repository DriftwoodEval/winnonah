export async function getOpenPhoneUsers(apiKey: string) {
	const response = await fetch("https://api.openphone.com/v1/users", {
		headers: {
			Authorization: apiKey,
		},
	});

	if (!response.ok) {
		const errorData = (await response.json()) as { message?: string };
		throw new Error(errorData.message || "Failed to fetch users");
	}

	const data = (await response.json()) as {
		data: {
			id: string;
			firstName?: string;
			lastName?: string;
			email?: string;
		}[];
	};

	const numbersResponse = await fetch(
		"https://api.openphone.com/v1/phone-numbers",
		{
			headers: {
				Authorization: apiKey,
			},
		},
	);

	if (!numbersResponse.ok) {
		throw new Error("Failed to fetch phone numbers");
	}

	const numbersData = (await numbersResponse.json()) as {
		data: {
			id: string;
			number: string;
			userId?: string;
			sharedWith?: { userId: string }[];
		}[];
	};

	return data.data.map((user) => {
		const userNumber = numbersData.data.find(
			(n) =>
				n.userId === user.id || n.sharedWith?.some((s) => s.userId === user.id),
		);
		return {
			id: user.id,
			name:
				`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
				user.email ||
				user.id,
			phone: userNumber?.number ?? "",
		};
	});
}

export type TimelineEvent = {
	id: string;
	type: "message" | "call";
	direction: "incoming" | "outgoing";
	text?: string;
	duration?: number;
	status: string;
	createdAt: string;
	userId?: string;
};

export async function getMessages(
	apiKey: string,
	phoneNumberId: string,
	participantPhone: string,
): Promise<TimelineEvent[]> {
	const params = new URLSearchParams();
	params.append("phoneNumberId", phoneNumberId);
	params.append("participants", participantPhone);

	const response = await fetch(
		`https://api.openphone.com/v1/messages?${params}`,
		{
			headers: { Authorization: apiKey },
		},
	);

	if (!response.ok) {
		const errorData = (await response.json()) as { message?: string };
		throw new Error(errorData.message || "Failed to fetch messages");
	}

	const data = (await response.json()) as {
		data: {
			id: string;
			text?: string;
			direction: "incoming" | "outgoing";
			status: string;
			createdAt: string;
			userId?: string;
		}[];
	};

	return data.data.map((m) => ({
		id: m.id,
		type: "message",
		direction: m.direction,
		text: m.text,
		status: m.status,
		createdAt: m.createdAt,
		userId: m.userId,
	}));
}

export async function getCalls(
	apiKey: string,
	phoneNumberId: string,
	participantPhone: string,
): Promise<TimelineEvent[]> {
	const params = new URLSearchParams();
	params.append("phoneNumberId", phoneNumberId);
	params.append("participants", participantPhone);

	const response = await fetch(`https://api.openphone.com/v1/calls?${params}`, {
		headers: { Authorization: apiKey },
	});

	if (!response.ok) {
		const errorData = (await response.json()) as { message?: string };
		throw new Error(errorData.message || "Failed to fetch calls");
	}

	const data = (await response.json()) as {
		data: {
			id: string;
			direction: "incoming" | "outgoing";
			status: string;
			createdAt: string;
			duration?: number;
			userId?: string;
		}[];
	};

	return data.data.map((c) => ({
		id: c.id,
		type: "call",
		direction: c.direction,
		duration: c.duration,
		status: c.status,
		createdAt: c.createdAt,
		userId: c.userId,
	}));
}

export async function getContactTimeline(
	apiKey: string,
	phoneNumberId: string,
	participantPhone: string,
): Promise<TimelineEvent[]> {
	const [messages, calls] = await Promise.all([
		getMessages(apiKey, phoneNumberId, participantPhone),
		getCalls(apiKey, phoneNumberId, participantPhone),
	]);

	return [...messages, ...calls].sort(
		(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
	);
}
