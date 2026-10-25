import {
	type IssueListId,
	mergeIssueListOrder,
} from "~/lib/issues/issue-titles";
import { api } from "~/trpc/react";

/** The user's saved Issues page list order, with an optimistic setter. */
export function useIssueListOrder() {
	const utils = api.useUtils();
	const { data: savedOrder } = api.users.getIssueListOrder.useQuery();
	const { mutate: updateOrder } = api.users.updateIssueListOrder.useMutation();

	const setOrder = async (next: IssueListId[]) => {
		// Cancel any in-flight fetch so it can't land after this optimistic
		// write and revert the order back to the old value.
		await utils.users.getIssueListOrder.cancel();
		utils.users.getIssueListOrder.setData(undefined, next);
		updateOrder({ order: next });
	};

	return { order: mergeIssueListOrder(savedOrder), setOrder };
}
