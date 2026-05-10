"use client";

import { SessionExpiryMonitor } from "@components/shared/SessionExpiryMonitor";
import { SystemUpdateMonitor } from "@components/shared/SystemUpdateMonitor";
import { ThemeProvider } from "@components/shared/ThemeProvider";
import { SessionProvider } from "next-auth/react";
import { TRPCReactProvider } from "~/trpc/react";

export default function Providers({ children }: { children: React.ReactNode }) {
	return (
		<SessionProvider>
			<SessionExpiryMonitor />
			<TRPCReactProvider>
				<SystemUpdateMonitor />
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
