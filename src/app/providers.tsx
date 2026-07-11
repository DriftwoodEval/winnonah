"use client";

import { ImageLightboxProvider } from "@components/shared/ImageLightbox";
import { SessionExpiryMonitor } from "@components/shared/SessionExpiryMonitor";
import { SystemUpdateMonitor } from "@components/shared/SystemUpdateMonitor";
import { ThemeProvider } from "@components/shared/ThemeProvider";
import { TooltipProvider } from "@ui/tooltip";
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
					<TooltipProvider>
						<ImageLightboxProvider>{children}</ImageLightboxProvider>
					</TooltipProvider>
				</ThemeProvider>
			</TRPCReactProvider>
		</SessionProvider>
	);
}
