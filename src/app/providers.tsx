"use client";

import { ImageLightboxProvider } from "@components/shared/ImageLightbox";
import { SessionExpiryMonitor } from "@components/shared/SessionExpiryMonitor";
import { SystemUpdateMonitor } from "@components/shared/SystemUpdateMonitor";
import { ThemeProvider } from "@components/shared/ThemeProvider";
import { TooltipProvider } from "@ui/tooltip";
import { SessionProvider } from "next-auth/react";
import { RedactionProvider } from "~/app/_components/redaction/redaction";
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
						<ImageLightboxProvider>
							<RedactionProvider>{children}</RedactionProvider>
						</ImageLightboxProvider>
					</TooltipProvider>
				</ThemeProvider>
			</TRPCReactProvider>
		</SessionProvider>
	);
}
