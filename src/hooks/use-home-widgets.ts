import {
	DEFAULT_HOME_WIDGETS,
	type WidgetConfig,
} from "~/lib/layout/home-widgets";
import { api } from "~/trpc/react";

/** The user's saved home page widgets (or the defaults), with an optimistic setter. */
export function useHomeWidgets() {
	const utils = api.useUtils();
	const { data: savedWidgets, isLoading } = api.users.getHomeWidgets.useQuery();
	const { mutate: saveWidgets } = api.users.updateHomeWidgets.useMutation({
		onSettled: () => {
			utils.users.getHomeWidgets.invalidate();
		},
	});

	const setWidgets = async (next: WidgetConfig[]) => {
		// Cancel any in-flight fetch so it can't land after this optimistic
		// write and revert the layout back to the old value.
		await utils.users.getHomeWidgets.cancel();
		utils.users.getHomeWidgets.setData(undefined, next);
		saveWidgets({ widgets: next });
	};

	return {
		widgets: savedWidgets ?? DEFAULT_HOME_WIDGETS,
		isLoading,
		setWidgets,
	};
}
