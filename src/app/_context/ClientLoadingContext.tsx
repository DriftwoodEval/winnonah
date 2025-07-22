"use client";

import { createContext, type ReactNode, useState } from "react";

type ClientLoadingContextType = {
	isClientsLoaded: boolean;
	setClientsLoaded: (loaded: boolean) => void;
};

export const ClientLoadingContext = createContext<ClientLoadingContextType>({
	isClientsLoaded: false,
	setClientsLoaded: () => {},
});

export function ClientLoadingProvider({ children }: { children: ReactNode }) {
	const [isClientsLoaded, setClientsLoaded] = useState(false);

	return (
		<ClientLoadingContext.Provider
			value={{ isClientsLoaded, setClientsLoaded }}
		>
			{children}
		</ClientLoadingContext.Provider>
	);
}
