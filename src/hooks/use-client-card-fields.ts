import type { ClientCardFieldId } from "~/lib/clients/client-card";
import { api } from "~/trpc/react";

/** The fields the user wants on the client hover card, with an optimistic setter. */
export function useClientCardFields() {
	const utils = api.useUtils();
	const { data: fields, isLoading } = api.users.getClientCardFields.useQuery(
		undefined,
		{ staleTime: 5 * 60 * 1000 },
	);
	const { mutate: saveFields } = api.users.updateClientCardFields.useMutation({
		onSettled: () => {
			utils.users.getClientCardFields.invalidate();
		},
	});

	const setFields = async (next: ClientCardFieldId[]) => {
		// Cancel any in-flight fetch so it can't land after this optimistic
		// write and revert the selection back to the old value.
		await utils.users.getClientCardFields.cancel();
		utils.users.getClientCardFields.setData(undefined, next);
		saveFields({ fields: next });
	};

	return { fields, isLoading, setFields };
}
