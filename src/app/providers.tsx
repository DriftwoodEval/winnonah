"use client";

import { ThemeProvider } from "@components/shared/ThemeProvider";
import { SessionProvider } from "next-auth/react";
import { TRPCReactProvider } from "~/trpc/react";
import { SessionExpiryMonitor } from "./_components/shared/SessionExpiryMonitor";

export default function Providers({ children }: { children: React.ReactNode }) {
	return (
		<SessionProvider>
			<SessionExpiryMonitor />
			<TRPCReactProvider>
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					disableTransitionOnChange
					enableSystem
				>
					{children}
				</ThemeProvider>
			</TRPCReactProvider>
		</SessionProvider>
	);
}
